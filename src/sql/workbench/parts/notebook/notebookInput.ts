/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorModel } from 'vs/platform/editor/common/editor';
import { EditorInput, EditorModel, ConfirmResult } from 'vs/workbench/common/editor';
import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import * as azdata from 'azdata';
import * as os from 'os';

import { IStandardKernelWithProvider, getProvidersForFileName, getStandardKernelsForProvider } from 'sql/workbench/parts/notebook/notebookUtils';
import { INotebookService, DEFAULT_NOTEBOOK_PROVIDER, IProviderInfo } from 'sql/workbench/services/notebook/common/notebookService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { INotebookModel, IContentManager, NotebookContentChange } from 'sql/workbench/parts/notebook/models/modelInterfaces';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { Range } from 'vs/editor/common/core/range';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { Schemas } from 'vs/base/common/network';
import { ITextFileService, ISaveOptions, StateChange } from 'vs/workbench/services/textfile/common/textfiles';
import { LocalContentManager } from 'sql/workbench/services/notebook/node/localContentManager';
import { IConnectionProfile } from 'sql/platform/connection/common/interfaces';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IDisposable } from 'vs/base/common/lifecycle';
import { NotebookChangeType } from 'sql/workbench/parts/notebook/models/contracts';
import { ITextModel } from 'vs/editor/common/model';

export type ModeViewSaveHandler = (handle: number) => Thenable<boolean>;

export class NotebookEditorModel extends EditorModel {
	private dirty: boolean;
	private readonly _onDidChangeDirty: Emitter<void> = this._register(new Emitter<void>());
	constructor(public readonly notebookUri: URI,
		private textEditorModel: TextFileEditorModel | UntitledEditorModel,
		@INotebookService private notebookService: INotebookService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super();
		this._register(this.notebookService.onNotebookEditorAdd(notebook => {
			if (notebook.id === this.notebookUri.toString()) {
				// Hook to content change events
				notebook.modelReady.then(() => {
					this._register(notebook.model.kernelChanged(e => this.updateModel()));
					this._register(notebook.model.contentChanged(e => this.updateModel(e)));
				}, err => undefined);
			}
		}));

		if (this.textEditorModel instanceof UntitledEditorModel) {
			this._register(this.textEditorModel.onDidChangeDirty(e => this.setDirty(this.textEditorModel.isDirty())));
		} else {
			this._register(this.textEditorModel.onDidStateChange(change => {
				this.setDirty(this.textEditorModel.isDirty());
				if (change === StateChange.SAVED) {
					this.sendNotebookSerializationStateChange();
				}
			}));
		}
		this.dirty = this.textEditorModel.isDirty();
	}

	public get contentString(): string {
		let model = this.textEditorModel.textEditorModel;
		return model.getValue();
	}

	isDirty(): boolean {
		return this.textEditorModel.isDirty();
	}

	public setDirty(dirty: boolean): void {
		if (this.dirty === dirty) {
			return;
		}
		this.dirty = dirty;
		this._onDidChangeDirty.fire();
	}

	/**
	 * UntitledEditor uses TextFileService to save data from UntitledEditorInput
	 * Titled editor uses TextFileEditorModel to save existing notebook
	*/
	save(options: ISaveOptions): Promise<boolean> {
		if (this.textEditorModel instanceof TextFileEditorModel) {
			this.textEditorModel.save(options);
			return Promise.resolve(true);
		}
		else {
			return this.textFileService.save(this.notebookUri, options);
		}
	}

	public updateModel(contentChange?: NotebookContentChange): void {
		if (contentChange && contentChange.changeType === NotebookChangeType.TrustChanged) {
			// This is a serializable change (in that we permanently cache trusted state, but
			// ironically isn't cached in the JSON contents since trust doesn't persist across machines.
			// Request serialization so trusted state is preserved but don't update the model
			this.sendNotebookSerializationStateChange();
			return;
		}

		// For all other changes, update the backing model with the latest contents
		let notebookModel = this.getNotebookModel();
		if (!notebookModel || !this.textEditorModel || !this.textEditorModel.textEditorModel) {
			return;
		}

		let updatedContent = JSON.stringify(notebookModel.toJSON(), undefined, '    ').replace(/\n/g, os.EOL);
		let existingContent = this.textEditorModel.textEditorModel.getValue();

		let diff = DifferenceDetector.getDiff(existingContent, updatedContent);
		if (diff) {
			this.textEditorModel.textEditorModel.applyEdits([{
				range: diff.range,
				text: diff.text
			}]);
		}
	}

	private sendNotebookSerializationStateChange() {
		let notebookModel = this.getNotebookModel();
		if (notebookModel) {
			this.notebookService.serializeNotebookStateChange(this.notebookUri, NotebookChangeType.Saved);
		}
	}

	isModelCreated(): boolean {
		return this.getNotebookModel() !== undefined;
	}

	private getNotebookModel(): INotebookModel {
		let editor = this.notebookService.findNotebookEditor(this.notebookUri);
		if (editor) {
			return editor.model;
		}
		return undefined;
	}

	get onDidChangeDirty(): Event<void> {
		return this._onDidChangeDirty.event;
	}
}

export class NotebookInput extends EditorInput {
	public static ID: string = 'workbench.editorinputs.notebookInput';
	private _providerId: string;
	private _providers: string[];
	private _standardKernels: IStandardKernelWithProvider[];
	private _connectionProfile: IConnectionProfile;
	private _defaultKernel: azdata.nb.IKernelSpec;
	public hasBootstrapped = false;
	// Holds the HTML content for the editor when the editor discards this input and loads another
	private _parentContainer: HTMLElement;
	private readonly _layoutChanged: Emitter<void> = this._register(new Emitter<void>());
	private _model: NotebookEditorModel;
	private _untitledEditorModel: UntitledEditorModel;
	private _contentManager: IContentManager;
	private _providersLoaded: Promise<void>;
	private _dirtyListener: IDisposable;
	private _notebookEditorOpenedTimestamp: number;

	constructor(private _title: string,
		private resource: URI,
		private _textInput: UntitledEditorInput,
		@ITextModelService private textModelService: ITextModelService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@INotebookService private notebookService: INotebookService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super();
		this.resource = resource;
		this._standardKernels = [];
		this._providersLoaded = this.assignProviders();
		this._notebookEditorOpenedTimestamp = Date.now();
		if (this._textInput) {
			this.hookDirtyListener(this._textInput.onDidChangeDirty, () => this._onDidChangeDirty.fire());
		}
	}

	public get textInput(): UntitledEditorInput {
		return this._textInput;
	}

	public confirmSave(): Promise<ConfirmResult> {
		return this._textInput.confirmSave();
	}

	public revert(): Promise<boolean> {
		return this._textInput.revert();
	}

	public get notebookUri(): URI {
		return this.resource;
	}

	public get contentManager(): IContentManager {
		if (!this._contentManager) {
			this._contentManager = new NotebookEditorContentManager(this);
		}
		return this._contentManager;
	}

	public getName(): string {
		if (!this._title) {
			this._title = resources.basenameOrAuthority(this.resource);
		}
		return this._title;
	}

	public async getProviderInfo(): Promise<IProviderInfo> {
		await this._providersLoaded;
		return {
			providerId: this._providerId ? this._providerId : DEFAULT_NOTEBOOK_PROVIDER,
			providers: this._providers ? this._providers : [DEFAULT_NOTEBOOK_PROVIDER]
		};
	}

	public set connectionProfile(value: IConnectionProfile) {
		this._connectionProfile = value;
	}

	public get connectionProfile(): IConnectionProfile {
		return this._connectionProfile;
	}

	public get standardKernels(): IStandardKernelWithProvider[] {
		return this._standardKernels;
	}

	public save(): Promise<boolean> {
		let options: ISaveOptions = { force: false };
		return this._model.save(options);
	}

	public set standardKernels(value: IStandardKernelWithProvider[]) {
		value.forEach(kernel => {
			this._standardKernels.push({
				connectionProviderIds: kernel.connectionProviderIds,
				name: kernel.name,
				displayName: kernel.displayName,
				notebookProvider: kernel.notebookProvider
			});
		});
	}

	public get defaultKernel(): azdata.nb.IKernelSpec {
		return this._defaultKernel;
	}

	public set defaultKernel(kernel: azdata.nb.IKernelSpec) {
		this._defaultKernel = kernel;
	}

	get layoutChanged(): Event<void> {
		return this._layoutChanged.event;
	}

	public get editorOpenedTimestamp(): number {
		return this._notebookEditorOpenedTimestamp;
	}

	doChangeLayout(): any {
		this._layoutChanged.fire();
	}

	public getTypeId(): string {
		return NotebookInput.ID;
	}

	getResource(): URI {
		return this.resource;
	}

	public get untitledEditorModel(): UntitledEditorModel {
		return this._untitledEditorModel;
	}

	public set untitledEditorModel(value: UntitledEditorModel) {
		this._untitledEditorModel = value;
	}

	async resolve(): Promise<NotebookEditorModel> {
		if (this._model) {
			return Promise.resolve(this._model);
		} else {
			let textOrUntitledEditorModel: UntitledEditorModel | IEditorModel;
			if (this.resource.scheme === Schemas.untitled) {
				textOrUntitledEditorModel = this._untitledEditorModel ? this._untitledEditorModel : await this._textInput.resolve();
			}
			else {
				const textEditorModelReference = await this.textModelService.createModelReference(this.resource);
				textOrUntitledEditorModel = await textEditorModelReference.object.load();
			}
			this._model = this.instantiationService.createInstance(NotebookEditorModel, this.resource, textOrUntitledEditorModel);
			this.hookDirtyListener(this._model.onDidChangeDirty, () => this._onDidChangeDirty.fire());
			return this._model;
		}
	}

	private hookDirtyListener(dirtyEvent: Event<void>, listener: (e: any) => void): void {
		let disposable = dirtyEvent(listener);
		if (this._dirtyListener) {
			this._dirtyListener.dispose();
		} else {
			this._register({
				dispose: () => {
					if (this._dirtyListener) {
						this._dirtyListener.dispose();
					}
				}
			});
		}
		this._dirtyListener = disposable;
	}

	private async assignProviders(): Promise<void> {
		await this.extensionService.whenInstalledExtensionsRegistered();
		let providerIds: string[] = getProvidersForFileName(this._title, this.notebookService);
		if (providerIds && providerIds.length > 0) {
			this._providerId = providerIds.filter(provider => provider !== DEFAULT_NOTEBOOK_PROVIDER)[0];
			this._providers = providerIds;
			this._standardKernels = [];
			this._providers.forEach(provider => {
				let standardKernels = getStandardKernelsForProvider(provider, this.notebookService);
				this._standardKernels.push(...standardKernels);
			});
		}
	}

	public dispose(): void {
		this._disposeContainer();
		super.dispose();
	}

	private _disposeContainer() {
		if (!this._parentContainer) {
			return;
		}

		let parentNode = this._parentContainer.parentNode;
		if (parentNode) {
			parentNode.removeChild(this._parentContainer);
			this._parentContainer = null;
		}
	}

	set container(container: HTMLElement) {
		this._disposeContainer();
		this._parentContainer = container;
	}

	get container(): HTMLElement {
		return this._parentContainer;
	}

	/**
	 * An editor that is dirty will be asked to be saved once it closes.
	 */
	isDirty(): boolean {
		if (this._model) {
			return this._model.isDirty();
		} else if (this._textInput) {
			return this._textInput.isDirty();
		}
		return false;
	}

	/**
	 * Sets active editor with dirty value.
	 * @param isDirty boolean value to set editor dirty
	 */
	setDirty(isDirty: boolean): void {
		if (this._model) {
			this._model.setDirty(isDirty);
		}
	}

	updateModel(): void {
		this._model.updateModel();
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof NotebookInput) {
			const otherNotebookEditorInput = <NotebookInput>otherInput;

			// Compare by resource
			return otherNotebookEditorInput.notebookUri.toString() === this.notebookUri.toString();
		}
		return false;
	}
}

class NotebookEditorContentManager implements IContentManager {
	constructor(private notebookInput: NotebookInput) {
	}

	async loadContent(): Promise<azdata.nb.INotebookContents> {
		let notebookEditorModel = await this.notebookInput.resolve();
		let contentManager = new LocalContentManager();
		let contents = await contentManager.loadFromContentString(notebookEditorModel.contentString);
		return contents;
	}
}

class DifferenceDetector {
	private updatedContent: string;
	private updatedContentTail: string;
	private existingContent: string;
	private existingContentTail: string;
	private commonHead: string;
	private commonTail: string;

	public static getDiff(existingContent: string, updatedContent: string): { range: Range, text: string } {
		let instance: DifferenceDetector = new DifferenceDetector();
		return instance.getDifference(existingContent, updatedContent);
	}

	private getDifference(existingContent: string, updatedContent: string): { range: Range, text: string } {
		this.existingContent = existingContent;
		this.updatedContent = updatedContent;

		if (this.existingContent === this.updatedContent) {
			return undefined;
		}
		if (!this.existingContent || this.existingContent === '' || this.updatedContent.length < 1000) {
			return this.getAll();
		}

		let commonHeadEndIndex = this.getCommonHeadStrEndIndex(this.existingContent, this.updatedContent);
		if (!commonHeadEndIndex || commonHeadEndIndex < 0) {
			return this.getAll();
		}
		this.commonHead = this.existingContent.substr(0, commonHeadEndIndex + 1);
		this.existingContentTail = this.existingContent.replace(this.commonHead, '');
		this.updatedContentTail = this.updatedContent.replace(this.commonHead, '');
		if (this.updatedContentTail.includes(this.existingContentTail)) {
			return this.getAppended();
		} else if (this.existingContentTail.includes(this.updatedContentTail)) {
			return this.getRemoved();
		}

		let commonTailStartIndexFromEnd = this.getCommonTailStartIndexFromEnd(this.existingContent, this.updatedContent);
		if (!commonTailStartIndexFromEnd || commonTailStartIndexFromEnd < 0) {
			return this.getAll();
		}
		this.commonTail = this.existingContent.substr(this.existingContent.length - commonTailStartIndexFromEnd - 1);
		return this.getRemovedAndAppended();
	}

	private getAll(): { range: Range, text: string } {
		let lineAndColumn = this.getEndLineAndColumnNum(this.existingContent);
		let endLine = lineAndColumn[0];
		let endCol = lineAndColumn[1] + 1;
		return { range: new Range(1, 1, endLine, endCol), text: this.updatedContent };
	}

	private getAppended(): { range: Range, text: string } {
		let contentToAppend: string = this.updatedContentTail.replace(this.existingContentTail, '');
		let lineAndColumn = this.getEndLineAndColumnNum(this.commonHead);
		let lineNum = lineAndColumn[0];
		let columnNum = lineAndColumn[1] + 1;
		return {
			range: new Range(lineNum, columnNum, lineNum, columnNum),
			text: contentToAppend
		};
	}

	private getRemoved(): { range: Range, text: string } {
		let lineAndColumnStart = this.getEndLineAndColumnNum(this.commonHead);
		let lineStart = lineAndColumnStart[0];
		let columnStart = lineAndColumnStart[1] + 1;
		let existingContentWithoutTail: string = this.existingContent.replace(this.updatedContentTail, '');
		let lineAndColumnEnd = this.getEndLineAndColumnNum(existingContentWithoutTail);
		let lineEnd = lineAndColumnEnd[0];
		let columnEnd = lineAndColumnEnd[1] + 1;
		return {
			range: new Range(lineStart, columnStart, lineEnd, columnEnd),
			text: ''
		};
	}

	private getRemovedAndAppended(): { range: Range, text: string } {
		let contentToAppend: string = this.updatedContentTail.replace(this.commonTail, '');
		let lineAndColumnStart = this.getEndLineAndColumnNum(this.commonHead);
		let lineStart = lineAndColumnStart[0];
		let columnStart = lineAndColumnStart[1] + 1;
		let existingContentWithoutCommonTail: string = this.existingContent.replace(this.commonTail, '');
		let lineAndColumnEnd = this.getEndLineAndColumnNum(existingContentWithoutCommonTail);
		let lineEnd = lineAndColumnEnd[0];
		let columnEnd = lineAndColumnEnd[1] + 1;
		return {
			range: new Range(lineStart, columnStart, lineEnd, columnEnd),
			text: contentToAppend
		};
	}

	private getEndLineAndColumnNum(str: string): number[] {
		let lines: number = str.split(os.EOL).length;
		let columns: number = str.length - str.lastIndexOf(os.EOL) - os.EOL.length;
		return [lines, columns];
	}

	private getCommonHeadStrEndIndex(str1: string, str2: string): number {
		let commonHeadStrEndIndex: number = -1;
		let range: number[] = [0, str1.length < str2.length ? str1.length - 1 : str2.length - 1];
		while (range[0] >= 0 && range[1] >= 0 && range[0] <= range[1]) {
			let start = range[0];
			let end = range[1];
			if (start === end) {
				if (str1[start] === str2[start]) {
					commonHeadStrEndIndex = end;
				}
				break;
			}

			let mid = Math.floor((start + end) / 2);
			let halfLength = mid - start + 1;
			let s1 = str1.substr(start, halfLength);
			let s2 = str2.substr(start, halfLength);
			if (s1 === s2) {
				let nextOfMid = mid + 1;
				if (str1[nextOfMid] !== str2[nextOfMid]) {
					commonHeadStrEndIndex = mid;
					break;
				}
				range = [nextOfMid, end];
			}
			else {
				range = [start, mid];
			}
		}
		return commonHeadStrEndIndex;
	}

	private getCommonTailStartIndexFromEnd(str1: string, str2: string): number {
		let indexFromEnd: number = -1;
		let rangeLength: number = str1.length < str2.length ? str1.length - 1 : str2.length - 1;
		let str1Range: number[] = [str1.length - rangeLength - 1, str1.length - 1];
		let str2Range: number[] = [str2.length - rangeLength - 1, str2.length - 1];

		while (str1Range[0] >= 0 && str1Range[1] >= 0 && str1Range[0] <= str1Range[1]
			&& str2Range[0] >= 0 && str2Range[1] >= 0 && str2Range[0] <= str2Range[1]
		) {
			let str1Start = str1Range[0];
			let str1End = str1Range[1];
			let str2Start = str2Range[0];
			let str2End = str2Range[1];

			if (str1Start === str1End && str2Start === str2End) {
				if (str1[str1Start] === str2[str2Start]) {
					indexFromEnd = str1.length - str1Start - 1;
				}
				break;
			}

			let str1Mid = Math.floor((str1Start + str1End) / 2);
			let str1HalfLength = str1End - str1Mid + 1;
			let str2Mid = Math.floor((str2Start + str2End) / 2);
			let str2HalfLength = str2End - str2Mid + 1;
			let s1 = str1.substr(str1Mid, str1HalfLength);
			let s2 = str2.substr(str2Mid, str2HalfLength);
			if (s1 === s2) {
				if (str1Mid === 0 || str2Mid === 0 || str1[str1Mid - 1] !== str2[str2Mid - 1]) {
					indexFromEnd = str1.length - str1Mid - 1;
					break;
				}
				str1Range = [str1Start, str1Mid - 1];
				str2Range = [str2Start, str2Mid - 1];
			} else {
				str1Range = [str1Mid + 1, str1End];
				str2Range = [str2Mid + 1, str2End];
			}
		}
		return indexFromEnd;
	}
}

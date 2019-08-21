/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ScriptSelectAction, EditDataAction, ScriptCreateAction, ScriptExecuteAction, ScriptAlterAction, ScriptDeleteAction } from 'sql/workbench/electron-browser/scriptingActions';
import { TreeSelectionHandler } from 'sql/workbench/parts/objectExplorer/browser/treeSelectionHandler';
import { IConnectionManagementService } from 'sql/platform/connection/common/connectionManagement';
import { IObjectExplorerService } from 'sql/workbench/services/objectExplorer/common/objectExplorerService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ObjectExplorerActionsContext, getTreeNode } from 'sql/workbench/parts/objectExplorer/browser/objectExplorerActions';
import { TreeUpdateUtils } from 'sql/workbench/parts/objectExplorer/browser/treeUpdateUtils';
import { TreeNode } from 'sql/workbench/parts/objectExplorer/common/treeNode';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IErrorMessageService } from 'sql/platform/errorMessage/common/errorMessageService';
import { ICapabilitiesService } from 'sql/platform/capabilities/common/capabilitiesService';
import { ConnectionProfile } from 'sql/platform/connection/common/connectionProfile';
import Severity from 'vs/base/common/severity';

export const SCRIPT_AS_CREATE_COMMAND_ID = 'objectExplorer.scriptAsCreate';
export const SCRIPT_AS_DELETE_COMMAND_ID = 'objectExplorer.scriptAsDelete';
export const SCRIPT_AS_SELECT_COMMAND_ID = 'objectExplorer.scriptAsSelect';
export const SCRIPT_AS_EXECUTE_COMMAND_ID = 'objectExplorer.scriptAsExecute';
export const SCRIPT_AS_ALTER_COMMAND_ID = 'objectExplorer.scriptAsAlter';
export const EDIT_DATA_COMMAND_ID = 'objectExplorer.scriptAsEdit';
export const REFRESH_OE_COMMAND_ID = 'objectExplorer.refreshNode';

// Script as Select
CommandsRegistry.registerCommand({
	id: SCRIPT_AS_SELECT_COMMAND_ID,
	handler: async (accessor, args: ObjectExplorerActionsContext) => {
		const instantiationService = accessor.get(IInstantiationService);
		const connectionManagementService = accessor.get(IConnectionManagementService);
		const objectExplorerService = accessor.get(IObjectExplorerService);
		const selectionHandler = instantiationService.createInstance(TreeSelectionHandler);
		const node = await getTreeNode(args, objectExplorerService);
		selectionHandler.onTreeActionStateChange(true);
		let connectionProfile = TreeUpdateUtils.getConnectionProfile(node);
		let ownerUri = connectionManagementService.getConnectionUri(connectionProfile);
		ownerUri = connectionManagementService.getFormattedUri(ownerUri, connectionProfile);
		let metadata = node.metadata;

		return instantiationService.createInstance(ScriptSelectAction, ScriptSelectAction.ID, ScriptSelectAction.LABEL).run({ profile: connectionProfile, object: metadata }).then((result) => {
			selectionHandler.onTreeActionStateChange(false);
			return result;
		});
	}
});

// Edit Data
CommandsRegistry.registerCommand({
	id: EDIT_DATA_COMMAND_ID,
	handler: async (accessor, args: ObjectExplorerActionsContext) => {
		const instantiationService = accessor.get(IInstantiationService);
		const objectExplorerService = accessor.get(IObjectExplorerService);
		const selectionHandler = instantiationService.createInstance(TreeSelectionHandler);
		const node = await getTreeNode(args, objectExplorerService);
		selectionHandler.onTreeActionStateChange(true);
		let connectionProfile = TreeUpdateUtils.getConnectionProfile(node);
		let metadata = node.metadata;

		return instantiationService.createInstance(EditDataAction, EditDataAction.ID, EditDataAction.LABEL).run({ profile: connectionProfile, object: metadata }).then((result) => {
			selectionHandler.onTreeActionStateChange(false);
			return true;
		});
	}
});

// Script as Create
CommandsRegistry.registerCommand({
	id: SCRIPT_AS_CREATE_COMMAND_ID,
	handler: async (accessor, args: ObjectExplorerActionsContext) => {
		const instantiationService = accessor.get(IInstantiationService);
		const connectionManagementService = accessor.get(IConnectionManagementService);
		const objectExplorerService = accessor.get(IObjectExplorerService);
		const selectionHandler = instantiationService.createInstance(TreeSelectionHandler);
		const node = await getTreeNode(args, objectExplorerService);
		selectionHandler.onTreeActionStateChange(true);
		let connectionProfile = TreeUpdateUtils.getConnectionProfile(node);
		let metadata = node.metadata;
		let ownerUri = connectionManagementService.getConnectionUri(connectionProfile);
		ownerUri = connectionManagementService.getFormattedUri(ownerUri, connectionProfile);

		return instantiationService.createInstance(ScriptCreateAction, ScriptCreateAction.ID, ScriptCreateAction.LABEL).run({ profile: connectionProfile, object: metadata }).then((result) => {
			selectionHandler.onTreeActionStateChange(false);
			return result;
		});
	}
});

// Script as Execute
CommandsRegistry.registerCommand({
	id: SCRIPT_AS_EXECUTE_COMMAND_ID,
	handler: async (accessor, args: ObjectExplorerActionsContext) => {
		const instantiationService = accessor.get(IInstantiationService);
		const connectionManagementService = accessor.get(IConnectionManagementService);
		const objectExplorerService = accessor.get(IObjectExplorerService);
		const selectionHandler = instantiationService.createInstance(TreeSelectionHandler);
		const node = await getTreeNode(args, objectExplorerService);
		selectionHandler.onTreeActionStateChange(true);
		let connectionProfile = TreeUpdateUtils.getConnectionProfile(node);
		let metadata = node.metadata;
		let ownerUri = connectionManagementService.getConnectionUri(connectionProfile);
		ownerUri = connectionManagementService.getFormattedUri(ownerUri, connectionProfile);

		return instantiationService.createInstance(ScriptExecuteAction, ScriptExecuteAction.ID, ScriptExecuteAction.LABEL).run({ profile: connectionProfile, object: metadata }).then((result) => {
			selectionHandler.onTreeActionStateChange(false);
			return result;
		});
	}
});

// Script as Alter
CommandsRegistry.registerCommand({
	id: SCRIPT_AS_ALTER_COMMAND_ID,
	handler: async (accessor, args: ObjectExplorerActionsContext) => {
		const instantiationService = accessor.get(IInstantiationService);
		const connectionManagementService = accessor.get(IConnectionManagementService);
		const objectExplorerService = accessor.get(IObjectExplorerService);
		const selectionHandler = instantiationService.createInstance(TreeSelectionHandler);
		const node = await getTreeNode(args, objectExplorerService);
		selectionHandler.onTreeActionStateChange(true);
		let connectionProfile = TreeUpdateUtils.getConnectionProfile(node);
		let metadata = node.metadata;
		let ownerUri = connectionManagementService.getConnectionUri(connectionProfile);
		ownerUri = connectionManagementService.getFormattedUri(ownerUri, connectionProfile);

		return instantiationService.createInstance(ScriptAlterAction, ScriptAlterAction.ID, ScriptAlterAction.LABEL).run({ profile: connectionProfile, object: metadata }).then((result) => {
			selectionHandler.onTreeActionStateChange(false);
			return result;
		});
	}
});


// Script as Delete
CommandsRegistry.registerCommand({
	id: SCRIPT_AS_DELETE_COMMAND_ID,
	handler: async (accessor, args: ObjectExplorerActionsContext) => {
		const instantiationService = accessor.get(IInstantiationService);
		const connectionManagementService = accessor.get(IConnectionManagementService);
		const objectExplorerService = accessor.get(IObjectExplorerService);
		const selectionHandler = instantiationService.createInstance(TreeSelectionHandler);
		//set objectExplorerTreeNode for context menu clicks
		const node = await getTreeNode(args, objectExplorerService);
		selectionHandler.onTreeActionStateChange(true);
		const connectionProfile = TreeUpdateUtils.getConnectionProfile(<TreeNode>node);
		const metadata = node.metadata;
		let ownerUri = connectionManagementService.getConnectionUri(connectionProfile);
		ownerUri = connectionManagementService.getFormattedUri(ownerUri, connectionProfile);

		return instantiationService.createInstance(ScriptDeleteAction, ScriptDeleteAction.ID, ScriptDeleteAction.LABEL).run({ profile: connectionProfile, object: metadata }).then((result) => {
			selectionHandler.onTreeActionStateChange(false);
			return result;
		});
	}
});

// Refresh Action for Scriptable objects
CommandsRegistry.registerCommand({
	id: REFRESH_OE_COMMAND_ID,
	handler: async (accessor, args: ObjectExplorerActionsContext) => {
		const connectionManagementService = accessor.get(IConnectionManagementService);
		const capabilitiesService = accessor.get(ICapabilitiesService);
		const objectExplorerService = accessor.get(IObjectExplorerService);
		const errorMessageService = accessor.get(IErrorMessageService);
		const connection = new ConnectionProfile(capabilitiesService, args.connectionProfile);
		let treeNode: TreeNode;
		if (connectionManagementService.isConnected(undefined, connection)) {
			treeNode = await getTreeNode(args, objectExplorerService);
			if (treeNode === undefined) {
				objectExplorerService.updateObjectExplorerNodes(connection.toIConnectionProfile()).then(() => {
					treeNode = objectExplorerService.getObjectExplorerNode(connection);
				});
			}
		}
		const tree = objectExplorerService.getServerTreeView().tree;
		if (treeNode) {
			return tree.collapse(treeNode).then(() => {
				return objectExplorerService.refreshTreeNode(treeNode.getSession(), treeNode).then(() => {
					return tree.refresh(treeNode).then(() => {
						return tree.expand(treeNode);
					}, refreshError => {
						return Promise.resolve(true);
					});
				}, error => {
					errorMessageService.showDialog(Severity.Error, '', error);
					return Promise.resolve(true);
				});
			}, collapseError => {
				return Promise.resolve(true);
			});
		}
		return Promise.resolve(true);
	}
});

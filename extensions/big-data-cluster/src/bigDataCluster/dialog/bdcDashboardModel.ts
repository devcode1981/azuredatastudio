/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { getBdcStatus, getEndPoints } from '../controller/clusterControllerApi';
import { EndpointModel, BdcStatusModel } from '../controller/apiGenerated';
import { showErrorMessage, Endpoint } from '../utils';

export class BdcDashboardModel {

	private _bdcStatus: BdcStatusModel;
	private _endpoints: EndpointModel[] = [];
	private _bdcStatusLastUpdated: Date;
	private _endpointsLastUpdated: Date;
	private readonly _onDidUpdateEndpoints = new vscode.EventEmitter<EndpointModel[]>();
	private readonly _onDidUpdateBdcStatus = new vscode.EventEmitter<BdcStatusModel>();
	public onDidUpdateEndpoints = this._onDidUpdateEndpoints.event;
	public onDidUpdateBdcStatus = this._onDidUpdateBdcStatus.event;

	constructor(public clusterName: string, private url: string, private username: string, private password: string) {
		this.refresh();
	}

	public get bdcStatus(): BdcStatusModel | undefined {
		return this._bdcStatus;
	}

	public get serviceEndpoints(): EndpointModel[] {
		return this._endpoints || [];
	}

	public get bdcStatusLastUpdated(): Date {
		return this._bdcStatusLastUpdated;
	}

	public get endpointsLastUpdated(): Date {
		return this._endpointsLastUpdated;
	}

	public async refresh(): Promise<void> {
		await Promise.all([
			getBdcStatus(this.url, this.username, this.password, true).then(response => {
				this._bdcStatus = response.bdcStatus;
				this._bdcStatusLastUpdated = new Date();
				this._onDidUpdateBdcStatus.fire(this.bdcStatus);
			}),
			getEndPoints(this.url, this.username, this.password, true).then(response => {
				this._endpoints = response.endPoints || [];
				fixEndpoints(this._endpoints);
				this._endpointsLastUpdated = new Date();
				this._onDidUpdateEndpoints.fire(this.serviceEndpoints);
			})
		]).catch(error => showErrorMessage(error));
	}
}

/**
 * Applies fixes to the endpoints received so they are displayed correctly
 * @param endpoints The endpoints received to modify
 */
function fixEndpoints(endpoints: EndpointModel[]) {
	endpoints.forEach(e => {
		if (e.name === Endpoint.metricsui && e.endpoint && e.endpoint.indexOf('/d/wZx3OUdmz') === -1) {
			// Update to have correct URL
			e.endpoint += '/d/wZx3OUdmz';
		}
		if (e.name === Endpoint.logsui && e.endpoint && e.endpoint.indexOf('/app/kibana#/discover') === -1) {
			// Update to have correct URL
			e.endpoint += '/app/kibana#/discover';
		}
	});
}

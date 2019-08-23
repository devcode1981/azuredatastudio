/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as azdata from 'azdata';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { BdcDashboardModel } from './bdcDashboardModel';
import { IconPathHelper } from '../constants';
import { BdcServiceStatusPage } from './bdcServiceStatusPage';
import { BdcDashboardOverviewPage } from './bdcDashboardOverviewPage';
import { EndpointModel, BdcStatusModel, ServiceStatusModel } from '../controller/apiGenerated';
import { getHealthStatusDot, getServiceNameDisplayText } from '../utils';

const localize = nls.loadMessageBundle();

const navWidth = '175px';

export class BdcDashboard {

	private dashboard: azdata.workspace.ModelViewEditor;

	private initialized: boolean = false;
	private serviceTabsCreated: boolean = false;

	private modelView: azdata.ModelView;
	private mainAreaContainer: azdata.FlexContainer;
	private navContainer: azdata.FlexContainer;
	private currentPage: azdata.FlexContainer;

	constructor(private title: string, private model: BdcDashboardModel) {
		this.model.onDidUpdateEndpoints(endpoints => this.handleEndpointsUpdate(endpoints));
		this.model.onDidUpdateBdcStatus(bdcStatus => this.handleBdcStatusUpdate(bdcStatus));
	}

	public showDashboard(): void {
		this.createDashboard();
		this.dashboard.openEditor();
	}

	private createDashboard(): void {
		this.dashboard = azdata.workspace.createModelViewEditor(this.title, { retainContextWhenHidden: true, supportsSave: false });
		this.dashboard.registerContent(async (modelView: azdata.ModelView) => {
			this.modelView = modelView;
			const rootContainer = modelView.modelBuilder.flexContainer().withLayout(
				{
					flexFlow: 'column',
					width: '100%',
					height: '100%',
					alignItems: 'left'
				}).component();

			// ###########
			// # TOOLBAR #
			// ###########

			// Refresh button
			const refreshButton = modelView.modelBuilder.button()
				.withProperties({
					label: localize('bdc.dashboard.refreshButton', "Refresh"),
					iconPath: IconPathHelper.refresh,
					height: '50px'
				}).component();

			refreshButton.onDidClick(() => this.model.refresh());

			const openTroubleshootNotebookButton = modelView.modelBuilder.button()
				.withProperties({
					label: localize('bdc.dashboard.troubleshootButton', "Troubleshoot"),
					iconPath: IconPathHelper.notebook,
					height: '50px'
				}).component();

			openTroubleshootNotebookButton.onDidClick(() => {
				vscode.commands.executeCommand('mssqlCluster.task.openNotebook');
			});

			const toolbarContainer = modelView.modelBuilder.toolbarContainer()
				.withToolbarItems(
					[
						{ component: refreshButton },
						{ component: openTroubleshootNotebookButton }
					]
				).component();

			rootContainer.addItem(toolbarContainer, { flex: '0 0 auto' });

			// #############
			// # MAIN AREA #
			// #############

			this.mainAreaContainer = modelView.modelBuilder.flexContainer().withLayout(
				{
					flexFlow: 'row',
					width: '100%',
					height: '100%',
					alignItems: 'left'
				}).component();

			rootContainer.addItem(this.mainAreaContainer, { flex: '0 0 100%' });

			// #################
			// # NAV CONTAINER #
			// #################

			this.navContainer = modelView.modelBuilder.flexContainer().withLayout(
				{
					flexFlow: 'column',
					width: navWidth,
					height: '100%',
					alignItems: 'left'
				}
			).component();

			this.mainAreaContainer.addItem(this.navContainer, { flex: `0 0 ${navWidth}`, CSSStyles: { 'padding-left': '10px', 'border-right': 'solid 1px #ccc' } });

			// Overview nav item - this will be the initial page
			const overviewNavItem = modelView.modelBuilder.divContainer().withLayout({ width: navWidth, height: '30px' }).component();
			overviewNavItem.addItem(modelView.modelBuilder.text().withProperties({ value: localize('bdc.dashboard.overviewNavTitle', 'Big data cluster overview') }).component(), { CSSStyles: { 'user-select': 'text' } });
			const overviewPage = new BdcDashboardOverviewPage(this.model).create(modelView);
			this.currentPage = overviewPage;
			this.mainAreaContainer.addItem(overviewPage, { flex: '0 0 100%' });

			overviewNavItem.onDidClick(() => {
				this.mainAreaContainer.removeItem(this.currentPage);
				this.mainAreaContainer.addItem(overviewPage, { flex: '0 0 100%' });
				this.currentPage = overviewPage;
			});
			this.navContainer.addItem(overviewNavItem, { flex: '0 0 auto' });

			await modelView.initializeModel(rootContainer);

			this.initialized = true;

			// Now that we've created the UI load data from the model in case it already had data
			this.handleEndpointsUpdate(this.model.serviceEndpoints);
			this.handleBdcStatusUpdate(this.model.bdcStatus);
		});
	}

	private handleEndpointsUpdate(endpoints: EndpointModel[]): void {
		if (!this.initialized || !endpoints) {
			return;
		}
	}

	private handleBdcStatusUpdate(bdcStatus: BdcStatusModel): void {
		if (!this.initialized || !bdcStatus) {
			return;
		}

		this.createServiceNavTabs(bdcStatus.services);
	}

	/**
	 * Helper to create the navigation tabs for the services once the status has been loaded
	 */
	private createServiceNavTabs(services: ServiceStatusModel[]): void {
		if (this.initialized && !this.serviceTabsCreated && services) {
			// Add a nav item for each service
			services.forEach(s => {
				const navItem = createServiceNavTab(this.modelView.modelBuilder, s);
				const serviceStatusPage = new BdcServiceStatusPage(s.serviceName, this.model, this.modelView).container;
				navItem.onDidClick(() => {
					this.mainAreaContainer.removeItem(this.currentPage);
					this.mainAreaContainer.addItem(serviceStatusPage);
					this.currentPage = serviceStatusPage;
				});
				this.navContainer.addItem(navItem, { flex: '0 0 auto' });
			});
			this.serviceTabsCreated = true;
		}
	}
}

function createServiceNavTab(modelBuilder: azdata.ModelBuilder, serviceStatus: ServiceStatusModel): azdata.DivContainer {
	const div = modelBuilder.divContainer().withLayout({ width: navWidth, height: '30px' }).component();
	const innerContainer = modelBuilder.flexContainer().withLayout({ width: navWidth, height: '30px', flexFlow: 'row' }).component();
	innerContainer.addItem(modelBuilder.text().withProperties({ value: getHealthStatusDot(serviceStatus.healthStatus), CSSStyles: { 'margin-block-start': '0px', 'margin-block-end': '0px', 'user-select': 'none', 'color': 'red', 'font-size': '40px', 'width': '20px' } }).component(), { flex: '0 0 auto' });
	innerContainer.addItem(modelBuilder.text().withProperties({ value: getServiceNameDisplayText(serviceStatus.serviceName), CSSStyles: { 'margin-block-start': '0px', 'margin-block-end': '0px', 'user-select': 'text' } }).component(), { flex: '0 0 auto' });
	div.addItem(innerContainer);
	return div;
}

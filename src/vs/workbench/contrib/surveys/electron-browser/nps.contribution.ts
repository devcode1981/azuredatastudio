/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { language } from 'vs/base/common/platform';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import pkg from 'vs/platform/product/node/package';
import product from 'vs/platform/product/node/product';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Severity, INotificationService } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';

const PROBABILITY = 0.15;
const SESSION_COUNT_KEY = 'nps/sessionCount';
const LAST_SESSION_DATE_KEY = 'nps/lastSessionDate';
const SKIP_VERSION_KEY = 'nps/skipVersion';
const IS_CANDIDATE_KEY = 'nps/isCandidate';

class NPSContribution implements IWorkbenchContribution {

	constructor(
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IOpenerService openerService: IOpenerService
	) {
		const skipVersion = storageService.get(SKIP_VERSION_KEY, StorageScope.GLOBAL, '');
		if (skipVersion) {
			return;
		}

		const date = new Date().toDateString();
		const lastSessionDate = storageService.get(LAST_SESSION_DATE_KEY, StorageScope.GLOBAL, new Date(0).toDateString());

		if (date === lastSessionDate) {
			return;
		}

		const sessionCount = (storageService.getNumber(SESSION_COUNT_KEY, StorageScope.GLOBAL, 0) || 0) + 1;
		storageService.store(LAST_SESSION_DATE_KEY, date, StorageScope.GLOBAL);
		storageService.store(SESSION_COUNT_KEY, sessionCount, StorageScope.GLOBAL);

		if (sessionCount < 9) {
			return;
		}

		const isCandidate = storageService.getBoolean(IS_CANDIDATE_KEY, StorageScope.GLOBAL, false)
			|| Math.random() < PROBABILITY;

		storageService.store(IS_CANDIDATE_KEY, isCandidate, StorageScope.GLOBAL);

		if (!isCandidate) {
			storageService.store(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
			return;
		}

		notificationService.prompt(
			Severity.Info,
			nls.localize('surveyQuestion', "Do you mind taking a quick feedback survey?"),
			[{
				label: nls.localize('takeSurvey', "Take Survey"),
				run: () => {
					telemetryService.getTelemetryInfo().then(info => {
						openerService.open(URI.parse(`${product.npsSurveyUrl}?o=${encodeURIComponent(process.platform)}&v=${encodeURIComponent(pkg.version)}&m=${encodeURIComponent(info.machineId)}`));
						storageService.store(IS_CANDIDATE_KEY, false, StorageScope.GLOBAL);
						storageService.store(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
					});
				}
			}, {
				label: nls.localize('remindLater', "Remind Me later"),
				run: () => storageService.store(SESSION_COUNT_KEY, sessionCount - 3, StorageScope.GLOBAL)
			}, {
				label: nls.localize('neverAgain', "Don't Show Again"),
				run: () => {
					storageService.store(IS_CANDIDATE_KEY, false, StorageScope.GLOBAL);
					storageService.store(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
				}
			}],
			{ sticky: true }
		);
	}
}

if (language === 'en' && product.npsSurveyUrl) {
	const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(NPSContribution, LifecyclePhase.Restored);
}

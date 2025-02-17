'use strict'

import Branch from '../../../models/Branch'
import Git from '../../../models/Git'
import InformationMessage from '../../../UI/InformationMessage'
import Logger from '../../../UI/Logger'
import MessageOption from '../../../UI/MessageOption'
import Status from '../../../UI/Status'
import StatusBar from '../../../UI/StatusBar'
import GitRepository from '../../../application/GitRepository'
import ChangeHandler from '../../ChangeHandler'
import Event from '../../../models/Event'
import EventHandler from '../../EventHandler'
import Config, { ConfigOptions } from '../../../application/Config'

/**
 * this Handler is responsible for resolving the "detached HEAD" status
 */
export default class DetectDetachedHead extends ChangeHandler {
	static registerEventHandler(): void {
		if (Config.isEnabled('detectDetachedHead')) {
			EventHandler.registerHandler(Event.GIT_BRANCH_CHANGED, this)
		}
	}

	static async handle(repositoryPath: string): Promise<void> {
		const gitModel = await GitRepository.getGitModel(repositoryPath)
		if (!gitModel.isHeadDetached()) {
			return
		}

		const branch = await DetectDetachedHead.getRealBranchForHash(gitModel)
		if (!branch.length) {
			return
		}

		// remove remote from Branch-name
		const split = branch.split('/')
		const localBranch = split.slice(1).join('')

		if (Config.getValue('detectDetachedHead') === ConfigOptions.auto) {
			await GitRepository.checkoutBranchForRepository(gitModel.getRelativePath(), localBranch)
			StatusBar.addStatus(Status.autoCheckoutForDetachedHead(gitModel.getRelativePath(), localBranch))

			return
		}

		let message = `the HEAD of your Repository is detached. Would you like to checkout its corresponding branch '${localBranch}'?`

		if (!gitModel.isRootGit()) {
			message = `The HEAD of the Submodule '${gitModel.getRelativePath()}' in your Repisotory is detached. Would you like to checkout its corresponding branch '${localBranch}'?`
		}

		const action = await InformationMessage.showInformationMessage(
			message,
			MessageOption.optionYES,
			MessageOption.optionNO
		)
		if (action !== MessageOption.YES) {
			return
		}

		await GitRepository.checkoutBranchForRepository(gitModel.getRelativePath(), localBranch)
	}

	/**
	 * finds the corresponding Branch for a Commit-Hash
	 */
	private static getRealBranchForHash = async (gitModel: Git): Promise<string> => {
		// the first one in the list is the current "detached HEAD"
		const branches = gitModel.getBranches().filter((branch, index) => index > 1)
		const current = gitModel.getBranch()

		let realBranch = ''
		branches.forEach((branch: Branch) => {
			if (current === branch.getCommit() || current === branch.getName()) {
				realBranch = branch.getName()
			}
		})

		if (realBranch.length) {
			return realBranch
		}

		Logger.showError(
			`could not find branch for '${current}' ${
				!gitModel.isRootGit() ? ` in Submodule '${gitModel.getRelativePath()}'` : ''
			}. You have to checkout the branch manually.`,
			true
		)

		return ''
	}
}

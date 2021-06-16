import { Contracts } from "@arkecosystem/core-api";
import { Container } from "@arkecosystem/core-kernel";

import { Auction } from "../entities";

@Container.injectable()
export class AuctionResource implements Contracts.Resource {
	/**
	 * Return the raw representation of the resource.
	 *
	 * @param {*} resource
	 * @returns {object}
	 * @memberof Resource
	 */
	public raw(resource: Auction): object {
		return JSON.parse(JSON.stringify(resource));
	}

	/**
	 * Return the transformed representation of the resource.
	 *
	 * @param {*} resource
	 * @returns {object}
	 * @memberof Resource
	 */
	public transform(resource: Auction): object {
		const { id, expiration: blockHeight, nftIds, senderPublicKey, startAmount } = resource;

		return { id, senderPublicKey, nftAuction: { nftIds, startAmount, expiration: { blockHeight } } };
	}
}

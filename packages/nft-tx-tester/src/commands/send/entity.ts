import { flags } from "@oclif/command";

import { builders } from "../../builders";
import { TransactionType } from "../../enums";
import { SendBase } from "../../shared/send-base";

export default class Entity extends SendBase {
    public static description = SendBase.defaultDescription + builders[TransactionType.Entity].name;
    public static flags = {
        ...SendBase.defaultFlags,
        type: flags.string({
            description: "Entity type",
            options: ["business", "bridgechain", "developer", "plugin-core", "plugin-desktop"],
        }),
        action: flags.string({ description: "Entity action", options: ["register", "update", "resign"] }),
        registrationId: flags.string({ description: "Registration Id" }),
        name: flags.string({ description: "Register name" }),
        ipfsData: flags.string({ description: "Ipfs data" }),
    };

    public type = TransactionType.Entity;

    protected prepareConfig(config, flags) {
        const mergedConfig = { ...config };
        if (flags.type) {
            mergedConfig.entity.type = flags.type;
        }
        if (flags.action) {
            mergedConfig.entity.action = flags.action;
        }
        if (flags.registrationId) {
            mergedConfig.entity.registrationId = flags.registrationId;
        }
        if (flags.name) {
            mergedConfig.entity.data.name = flags.name;
        }
        if (flags.ipfsData) {
            mergedConfig.entity.data.ipfsData = flags.ipfsData;
        }

        return mergedConfig;
    }

    protected getCommand(): any {
        return Entity;
    }
}
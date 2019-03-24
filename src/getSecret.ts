import {Adapter, Secretary} from '@secretary/aws-secrets-manager';
import {SecretsManager} from 'aws-sdk';
import {CredentialsOptions} from 'aws-sdk/lib/credentials';

let manager: Secretary<Adapter>     = null;
let credentials: CredentialsOptions = null;

export interface Secret {
    key: string;
    path: string;
}

export default async (options: Secret): Promise<string> => {
    await initialize(credentials);
    const secret = await manager.getSecret(options);

    return secret.value;
};

export async function initialize(initialConfigs: CredentialsOptions): Promise<void> {
    if (manager) {
        return;
    }

    credentials = initialConfigs;

    console.log('Initializing Secretary');
    manager = new Secretary(
        new Adapter({
            client: new SecretsManager({
                credentials,
                region:      'us-east-1',
                httpOptions: {
                    timeout: 2000,
                },
            }),
            cache:  {
                enabled: true,
            },
        }),
    );
}

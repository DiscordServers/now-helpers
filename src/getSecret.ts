import {Adapter, Secretary} from '@secretary/aws-secrets-manager';
import AWS, {SecretsManager} from 'aws-sdk';
import {CredentialsOptions} from 'aws-sdk/lib/credentials';

let manager: Secretary<Adapter>     = null;
let credentials: CredentialsOptions = null;

export default async (key: string, path: string): Promise<string> => {
    await initialize(credentials);
    const secret = await manager.getSecret({key, path});

    return secret.value;
};

export async function initialize(initialConfigs: CredentialsOptions): Promise<void> {
    if (manager) {
        return;
    }

    credentials = initialConfigs;

    console.log('Initializing Secretary', credentials);
    AWS.config.update({region: 'us-east-1', credentials});
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

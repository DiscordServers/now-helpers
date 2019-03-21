import {SecretsManager} from 'aws-sdk';
import {CredentialsOptions} from 'aws-sdk/lib/credentials';
import {AWSSecretsManagerAdapter, Secretary} from 'secretary-secrets';

let manager: Secretary<AWSSecretsManagerAdapter> = null;
let credentials: CredentialsOptions              = null;

export default async (key: string, path: string): Promise<string> => {
    await initialize(credentials);

    return manager.getSecret(key, path);
};

export async function initialize(initialConfigs: CredentialsOptions): Promise<void> {
    if (manager) {
        return;
    }
    credentials = initialConfigs;

    console.log('Initializing Secretary');
    manager = new Secretary(
        new AWSSecretsManagerAdapter({
            client: new SecretsManager({
                credentials,
                region:      'us-east-1',
                httpOptions: {
                    timeout: 3000,
                },
            }),
            cache:  {
                enabled: true,
            },
        }),
    );
}

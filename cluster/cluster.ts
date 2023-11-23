import * as pulumi from "@pulumi/pulumi";
import { local } from "@pulumi/command";

interface node {
    name: string
    ip: pulumi.Output<string>
    launchCommand: local.Command
    getIpCommand: local.Command
    ipCommands: local.Command[]
    installationCommand: local.Command
}

export const nodes: node[] = [];

export let kubeConfig: pulumi.Output<string>;
export let masterIp: pulumi.Output<string>;

export const createLocalCluster = (nodeCount: number) => {
    createNodes(nodeCount);
    installMicrok8s();
    formCluster();
}

const createNodes = (nodeCount: number) => {
    for (let index = 0; index < nodeCount; index++) {
        nodes.push({
            name: `microk8s-node${index}`
        } as node);
    }

    nodes.forEach(node => {
        const purgeCommand = new local.Command(`${node.name}purge`, {
            delete: 'multipass purge'
        });

        const creationCommand = new local.Command(`${node.name}Create`, {
            create: `multipass launch -m 8Gb -n ${node.name} -d 20G jammy`,
            delete: `multipass delete ${node.name}`
        },
        {
            dependsOn: purgeCommand,
        });
        node.launchCommand = creationCommand;
        node.getIpCommand = new local.Command(`${node.name}GetIp`, {
            create: `multipass info ${node.name} --format json`,
        },
        {
            dependsOn: creationCommand,
        });

        const nodeIp = pulumi.jsonParse(node.getIpCommand.stdout).apply( infoOutput => {
            node.ip = infoOutput.info[node.name].ipv4[0]
            return node.ip
        })
        
        nodes.forEach ( targetNode => 
            new local.Command( `host${node.name}To${targetNode.name}`, {
                create: pulumi.interpolate `multipass exec ${targetNode.name} -- sudo /bin/sh -c \"sudo echo ${nodeIp} ${node.name} >> /etc/hosts\"`
            },
            {
                dependsOn: targetNode.launchCommand
            })
        )
        
        if (node === nodes[0]) {
            masterIp = nodeIp
        }
        
    });
}

const installMicrok8s = () => {
    nodes.forEach(node => {
        const installCommand = new local.Command(
            `${node.name}InstallMicrok8s`,
            {
                create: `multipass exec ${node.name} -- sudo snap install microk8s --classic`,
            },
            {
                dependsOn: node.launchCommand,
            }
        );
        node.installationCommand = installCommand
        if (node === nodes[0]) {
            kubeConfig = new local.Command('kubeConfig', {
                create: `multipass exec ${node.name} -- sudo microk8s config`
            },
            {
                dependsOn: installCommand,
                additionalSecretOutputs: [
                    'stdout'
                ]
            }).stdout
            new local.Command('metallb', {
                create: pulumi.interpolate `multipass exec ${node.name} -- sudo microk8s enable metallb:${masterIp}/32`
                // microk8s enable metallb:10.64.140.43-10.64.140.49
            },
            {
                dependsOn: installCommand,
            })
        }
    }
    )
}

const formCluster = () => {
    nodes.forEach((node, index) => {
        if (index !== 0) {
            new local.Command(`${node.name}Join`,
                {
                    create: pulumi.interpolate`multipass exec ${node.name} -- sudo ${getJoinToken(node.name)}`,
                    delete: `multipass exec ${node.name} -- sudo microk8s leave`
                },
                {
                    dependsOn: node.ipCommands,
                }
            )
        }
    })
}

const getJoinToken = (nodeName: string) => {
    const addNodeCommand = new local.Command(`${nodeName}JoinCommand`, {
        create: `multipass exec ${nodes[0].name} -- sudo microk8s add-node`,
    }, {
        dependsOn: nodes[0].installationCommand
    });
    return addNodeCommand.stdout.apply(stdout => stdout.split('\n')[1]);
}

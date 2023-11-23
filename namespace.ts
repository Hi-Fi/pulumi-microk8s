import * as k8s from "@pulumi/kubernetes";

export const createNamespace = (name: string): k8s.core.v1.Namespace => {
    return new k8s.core.v1.Namespace(
        name,
        {
            metadata: {
                labels: {
                    creator: 'Pulumi',
                },
                name
            }
        },
    )
}

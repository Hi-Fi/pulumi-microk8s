import * as k8s from "@pulumi/kubernetes";
import { createNamespace } from "./namespace";

export const deployHelmRelease = (name: string, args?: k8s.helm.v3.ReleaseArgs | undefined) => {
    const ns = createNamespace(name);

    if (!args || !args.chart) {
        throw new Error('Chart is mandatory');
    }
    return new k8s.helm.v3.Release(name, {
        ...args,
        createNamespace: false,
        namespace: ns.metadata.name
    }
    )
}

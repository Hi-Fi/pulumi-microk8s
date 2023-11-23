import { createLocalCluster, kubeConfig, masterIp } from './cluster'

createLocalCluster(1);

export const kubeconfig = kubeConfig
export const masterIP = masterIp

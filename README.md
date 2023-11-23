# pulumi-microk8s

Learning Pulumi by using microk8s and adding basic services to cluster.

Example requires either usage of Pulumi Cloud or [self-managed backend](https://www.pulumi.com/docs/concepts/state/#using-a-self-managed-backend) to be able to utilize stack references. Local backend doesn't support those.

## Stacks

### Cluster

Basic Kubernetes cluster in this case created using Microk8s/multipass. There wasn't multipass plugin to Pulumi, so utilizing just commands

### service-base

Base service that cluster needs before application should be put to it. Includes

* Ingress-nginx
* Prometheus stack
* OpenUnison

As trials are made locally, no cert manager included at the moment

import { Provider } from "@pulumi/kubernetes";
import { Namespace, Secret } from "@pulumi/kubernetes/core/v1";
import { Chart, Release } from "@pulumi/kubernetes/helm/v3";
import { Config, Input, Output, Resource, interpolate } from "@pulumi/pulumi";
import { RandomPassword } from '@pulumi/random';

export class BaseServices {
    private readonly kubeProvider: Provider;
    private readonly baseDomain: Output<string>;
    private readonly config: Config;
    private grafanaClientSecret: Output<string> = new RandomPassword('grafanaClientSecret', { length: 64, special: false}).result;
    private grafanaClientId: Output<string> = Output.create('grafana');
    constructor(
        kubeconfig: Output<string>,
        private readonly lbIP: Output<string>,
    ) {
        this.config = new Config();
        this.kubeProvider = new Provider('kubernetes', {
            kubeconfig
        })
        this.baseDomain = interpolate `${lbIP}.nip.io`

        const monitoringRelease = this.monitoring();
        this.ingress('ingress-nginx', monitoringRelease)
        this.access('access')
    }

    private monitoring(namespaceName = 'monitoring') {
        const namespace = new Namespace(
            namespaceName, 
            {
                metadata: {
                    name: namespaceName
                }
            },
            {
                provider: this.kubeProvider
            }
        );

        const grafanaOidcSecret = new Secret('grafana-oidc', {
            metadata: {
                namespace: namespace.metadata.name,
            },
            stringData: {
                clientid: this.grafanaClientId,
                clientsecret: this.grafanaClientSecret,
            }
        },
        {
            provider: this.kubeProvider,
            dependsOn: namespace
        })

        return new Release(
            'kube-prometheus-stack', 
            {
                chart: 'kube-prometheus-stack',
                version: '52.0.1',
                namespace: namespace.metadata.name,
                repositoryOpts: {
                    repo: 'https://prometheus-community.github.io/helm-charts'
                },
                values: {
                    alertmanager: {
                        ingress: {
                            enabled: false // Handling with OpenUnison
                        },
                        alertmanagerSpec: {
                            externalUrl: interpolate `https://access.${this.baseDomain}/alertmanagger`,
                            routePrefix: '/alertmanager/'
                        }
                    },
                    prometheus: {
                        ingress: {
                            enabled: false
                        },
                        prometheusSpec: {
                            podMonitorSelectorNilUsesHelmValues: false,
                            serviceMonitorSelectorNilUsesHelmValues: false,
                            ruleSelectorNilUsesHelmValues: false,
                            probeSelectorNilUsesHelmValues: false,
                            externalUrl: interpolate `https://access.${this.baseDomain}/prometheus`,
                            routePrefix: '/prometheus/'
                        }
                    },
                    grafana: {
                        ingress: {
                            enabled: true,
                            ingressClassName: 'nginx'
                        },
                        extraSecretMounts: [
                            {
                                name: 'oidc-secret',
                                secretName: grafanaOidcSecret.metadata.name,
                                defaultMode: '0400',
                                mountPath: '/etc/secrets/auth_generic_oauth',
                                readOnly: true
                            }
                        ],
                        'grafana.ini': {
                            server: {
                                domain: interpolate `grafana.${this.baseDomain}`,
                                root_url: interpolate `https://grafana.${this.baseDomain}`
                            },
                            'auth.generic_oauth': {
                                enabled: true,
                                client_id: '$__file{/etc/secrets/auth_generic_oauth/clientid}',
                                client_secret: '$__file{/etc/secrets/auth_generic_oauth/clientsecret}',
                                name: 'OpenUnison',
                                auto_login: true,
                                scopes: 'openid profile',
                                use_pkce: true,
                                allow_sign_up: true,
                                tls_skip_verify_insecure: true,
                                auth_url: interpolate `https://access.${this.baseDomain}/auth/idp/grafana/auth`,
                                token_url: interpolate `https://access.${this.baseDomain}/auth/idp/grafana/token`,
                                api_url: interpolate `https://access.${this.baseDomain}/auth/idp/grafana/userinfo`,
                                role_attribute_path: 'roles'
                            }
                        }
                    }
                }
            },
            {
                provider: this.kubeProvider,
                dependsOn: namespace
            }
        )
    }

    private ingress(namespaceName = 'ingress-nginx', dependsOn?: (Input<Resource> | Input<Input<Resource>[]>) ) {
        const namespace = new Namespace(
            namespaceName, 
            {
                metadata: {
                    name: namespaceName
                }
            },
            {
                provider: this.kubeProvider
            }
        );

        new Release(
            namespaceName,
            {
                chart: 'ingress-nginx',
                version: '4.7.3',
                repositoryOpts: {
                    repo: 'https://kubernetes.github.io/ingress-nginx'
                },
                namespace: namespace.metadata.name,
                values: {
                    controller: {
                        metrics: {
                            enabled: true,
                            serviceMonitor: {
                                enabled: true,
                            }
                        },
                        service: {
                            loadBalancerIP: this.lbIP
                        },
                        config: {
                            'enable-real-ip': true,
                            'forwarded-for-header': 'proxy_protocol',
                            'use-forwarded-headers': true,
                            'compute-full-forwarded-for': true,
                            'log-format-upstream': '{"time": "$time_iso8601", "remote_addr": "$remote_addr", "x_forwarded_for": "$full_x_forwarded_for", "request_id": "$req_id", "remote_user": "$remote_user", "bytes_sent": $bytes_sent, "request_time": $request_time, "status": $status, "vhost": "$host", "request_proto": "$server_protocol", "path": "$uri", "request_query": "$args", "request_length": $request_length, "duration": $request_time,"method": "$request_method", "http_referrer": "$http_referer", "http_user_agent": "$http_user_agent" }',
                            'global-auth-cache-key': '$remote_user$http_authorization'
                        },
                        extraArgs: {
                            // Enable use of annotation nginx.ingress.kubernetes.io/ssl-passthrough
                            'enable-ssl-passthrough': ''
                        }
                    },
                    defaultBackend: {
                        enabled: false
                    }
                }
            },
            {
                provider: this.kubeProvider,
                dependsOn
            }
        )
    }

    private access(namespaceName = 'access', dependsOn?: (Input<Resource> | Input<Input<Resource>[]>)) {
        const namespace = new Namespace(
            namespaceName, 
            {
                metadata: {
                    name: namespaceName
                }
            },
            {
                provider: this.kubeProvider
            }
        );

        const operator = new Release(
            'openunison-operator',
            {
                chart: 'openunison-operator',
                repositoryOpts: {
                    repo: 'https://nexus.tremolo.io/repository/helm/'
                },
                version: '3.0.4',
                namespace: namespace.metadata.name
            },
            {
                dependsOn: namespace,
                provider: this.kubeProvider
            }
        )

        const secret = new Secret(
            'orchestra-secrets-source',
            {
                metadata: {
                    namespace: namespace.metadata.name,
                    name: 'orchestra-secrets-source',
                },
                stringData: {
                    unisonKeystorePassword: new RandomPassword('unisonKeystorePassword', { length: 32, special: false}).result,
                    GITHUB_SECRET_ID: 'c6109ba670d31cfd32b0bd086d9e6f7d84317fb6',
                    grafana: this.grafanaClientSecret,
                }
            }, 
            {
                provider: this.kubeProvider
            }
        )

        const values = {
            network: {
                openunison_host: interpolate `access.${this.baseDomain}`,
                api_server_host: interpolate `apiaccess.${this.baseDomain}`,
                session_inactivity_timeout_seconds: 900,
                force_redirect_to_tls: false,
                createIngressCertificate: true,
                ingress_type: 'nginx',
            },
            enable_impersonation: true,
            impersonation: {
                use_jetstack: true,
                explicit_certificate_trust: true
            },
            dashboard: {
                enabled: false
            },
            github:{
              client_id: this.config.requireSecret('clientId'),
              teams: this.config.requireSecret('teams')
            },
            openunison: {
                enable_provisioning: false,
            },
            network_policies: {
                enabled: false
            }
        }

        const orchertra = new Release(
            'orchestra',
            {
                chart: 'orchestra',
                repositoryOpts: {
                    repo: 'https://nexus.tremolo.io/repository/helm/'
                },
                version: '2.10.34',
                namespace: namespace.metadata.name,
                values
            },
            {
                dependsOn: [
                    operator,
                    secret
                ],
                provider: this.kubeProvider
            }
        )

        new Release(
            'orchestra-login-portal',
            {
                chart: 'orchestra-login-portal',
                repositoryOpts: {
                    repo: 'https://nexus.tremolo.io/repository/helm/'
                },
                version: '2.3.35',
                namespace: namespace.metadata.name,
                values
            },
            {
                // According instructions this should be deployed after orchestra, but impersonation doesn't work unless also portal is installed. So putting those same time
                dependsOn: [
                    operator,
                    secret
                ],
                provider: this.kubeProvider
            }
        )


    }
}
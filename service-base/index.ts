import { BaseServices } from './services'
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const stack = pulumi.getStack();
const org = config.require("org");
const stackRef = new pulumi.StackReference(`${org}/cluster/${stack}`)

new BaseServices(
    stackRef.getOutput('kubeconfig') as pulumi.Output<string>,
    stackRef.getOutput('masterIP') as pulumi.Output<string>
)

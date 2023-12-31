import * as pulumi from "@pulumi/pulumi";
import "jest";

/**
 * Convert a pulumi.Output to a promise of the same type.
 * 
 * @see https://www.pulumi.com/blog/testing-pulumi-programs-with-jest/
 */

function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise(resolve => output.apply(resolve));
}

describe("Kubernetes namespace", () => {

    // Define the infra variable as a type whose shape matches that of the
    // to-be-defined resources module.
    // https://www.typescriptlang.org/docs/handbook/2/typeof-types.html
    let infra: typeof import("./namespace");

    beforeAll(() => {

        // Put Pulumi in unit-test mode, mocking all calls to cloud-provider APIs.
        pulumi.runtime.setMocks({

            // Mock requests to provision cloud resources and return a canned response.
            newResource: (args: pulumi.runtime.MockResourceArgs): {id: string, state: any} => {

                // Here, we're returning a same-shaped object for all resource types.
                // We could, however, use the arguments passed into this function to
                // customize the mocked-out properties of a particular resource based
                // on its type. See the unit-testing docs for details:
                // https://www.pulumi.com/docs/using-pulumi/testing/unit
                return {
                    id: `${args.name}-id`,
                    state: args.inputs,
                };
            },

            // Mock function calls and return whatever input properties were provided.
            call: (args: pulumi.runtime.MockCallArgs) => {
                return args.inputs;
            },
        },
        'project',
        'stack',
        false);
    });

    beforeEach(async () => {

        // Dynamically import the resources module.
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports
        infra = await import("./namespace");
    });

    describe("is created with given name", () => {

        it("when set", async () => {
            const name = await promiseOf(infra.createNamespace('test').metadata.name);
            expect(name).toBe('test');
        });
    });
});
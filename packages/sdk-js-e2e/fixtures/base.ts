import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  context: async ({ browser }, use, testInfo) => {
    const context = await browser.newContext({
      recordHar: {
        path: testInfo.outputPath("network.har"),
        content: "embed",
        mode: "full",
      },
    });

    await use(context);
    await context.close();
  },
});

export { expect };

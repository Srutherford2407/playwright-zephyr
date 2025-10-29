import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { ZephyrOptions, ZephyrTestResult } from './convert-status';

import { gray } from 'picocolors';

import { archiveReport } from './archive-report';
import { convertStatus } from './convert-status';
import { createJsonReport } from './create-report-file';
import { validateOptions } from './validate-options';
import { ZephyrService } from './zephyr-cloud.service';

export default class ZephyrReporter implements Reporter {
  private zephyrService!: ZephyrService;
  private testResults: ZephyrTestResult[] = [];
  private projectKey!: string;
  private testCaseKeyPattern = /\[(.*?)\]/;
  private options: ZephyrOptions;

  constructor(options: ZephyrOptions) {
    this.options = validateOptions(options);
  }

  async onBegin() {
    this.projectKey = this.options.projectKey;

    this.zephyrService = new ZephyrService(this.options);
  }

onTestEnd(test: TestCase, result: TestResult) {
    if (test.title.match(this.testCaseKeyPattern) && test.title.match(this.testCaseKeyPattern)!.length > 1) {
      const [, testCaseId] = test.title.match(this.testCaseKeyPattern)!;
      const testCaseKey = `${this.projectKey}-${testCaseId}`;
      const status = convertStatus(result.status);

      // 1. Initialize comment with custom annotation content (if present)
      const customCommentAnnotation = test.annotations.find(a => a.type === 'zephyr-comment');
      let customComment = customCommentAnnotation
        ? `<b>📝 Custom Comment:</b> <br> <span style="color: rgb(0, 102, 204);">${customCommentAnnotation.description?.replaceAll(
            '\n',
            '<br>',
          )}</span> <br> <br>`
        : '';

      // 2. Append Playwright error details if the test failed
      const errorComment = result.error
        ? `<b>❌ Error Message: </b> <br> <span style="color: rgb(226, 80, 65);">${result.error?.message?.replaceAll(
            '\n',
            '<br>',
          )}</span> <br> <br> <b>🧱 Stack Trace:</b> <br> <span style="color: rgb(226, 80, 65);">${result.error?.stack?.replaceAll(
            '\n',
            '<br>',
          )}</span>`
        : '';

      // 3. Combine custom comment and error comment
      const finalComment = customComment + errorComment;
      
      const comment = finalComment.length > 0 ? finalComment : undefined;

      this.testResults.push({
        result: status,
        testCase: {
          key: testCaseKey,
          comment: comment, // Use the final combined comment
        },
      });
    }
  }

  async onEnd() {
    if (this.testResults.length > 0) {
      const testResultsPath = 'test-results/zephyr';
      const zephyrReportName = `zephyr-report-${new Date().getTime()}.json`;
      createJsonReport(zephyrReportName, testResultsPath, this.testResults);

      const zephyrReportPath = archiveReport(zephyrReportName, testResultsPath);

      await this.zephyrService.createRun(zephyrReportPath);
    } else {
      console.log(gray(`[zephyr reporter]: There's no Zephyr test case id in this spec file`));
    }
  }
}

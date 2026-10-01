import newman from 'newman';

const wrapperUrl = process.env.WRAPPER_URL ?? 'http://localhost:3000';
const targetUrl = process.env.TARGET_URL ?? 'http://127.0.0.1:4010/checkout';
const formUrl = process.env.FORM_URL ?? 'http://127.0.0.1:4010/form';
const apiKey = process.env.API_KEY ?? 'dev-local-key';

newman.run(
  {
    collection: 'postman/collection.json',
    envVar: [
      { key: 'baseUrl', value: wrapperUrl },
      { key: 'targetUrl', value: targetUrl },
      { key: 'formUrl', value: formUrl },
      { key: 'apiKey', value: apiKey },
    ],
    reporters: ['cli'],
  },
  (error, summary) => {
    if (error !== null) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    const failures = summary?.run?.failures ?? [];
    if (failures.length > 0) {
      process.stderr.write(`${failures.length} newman assertion(s) failed\n`);
      process.exit(1);
    }
    process.stdout.write('newman run passed\n');
  },
);

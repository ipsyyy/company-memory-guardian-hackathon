import { config } from "dotenv";

config({ path: ".env.local", override: true, quiet: true });

async function main() {
  const { askCompanyBrain } = await import("../src/lib/brain/ask");

  const question =
    process.argv.slice(2).join(" ") ||
    "What engineering problems are developers reporting in the available LangChain GitHub records?";

  console.log("\nQUESTION:\n", question);
  console.log("\nSearching real LangChain GitHub evidence...\n");

  const result = await askCompanyBrain(question);

  console.log("ANSWER:\n", result.answer);
  console.log("\nSOURCES:");

  for (const source of result.sources) {
    console.log(`${source.citation} ${source.title}`);
    console.log(`    ${source.url}`);
  }

  console.log(`\nEvidence records retrieved: ${result.evidenceCount}`);

  if (result.sources.some((source) => !source.url.startsWith("https://github.com/"))) {
    throw new Error("Invalid source URL detected.");
  }

  console.log("\nBackend test completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

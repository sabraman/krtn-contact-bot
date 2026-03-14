/**
 * scripts/deploy.ts
 * 
 * A helper script that reads .env and runs deployctl with all variables 
 * passed as --env flags. This ensures variables are set via the CLI.
 */

import { parse } from "jsr:@std/dotenv";

async function main() {
  const isProd = Deno.args.includes("--prod");
  
  // Read .env
  let envVars: Record<string, string> = {};
  try {
    const content = await Deno.readTextFile(".env");
    envVars = parse(content);
  } catch (err) {
    console.warn("⚠️ Could not read .env file, continuing with system env only.");
  }

  const args = [
    "run", "-A", "jsr:@deno/deployctl", "deploy",
    "--project=krtn-contact-bot",
    "--entrypoint=main.ts",
  ];

  if (isProd) {
    args.push("--prod");
  }

  // Add all env vars as --env flags
  for (const [key, value] of Object.entries(envVars)) {
    args.push(`--env=${key}=${value}`);
  }

  console.log(`🚀 Running deployment${isProd ? " (PROD)" : ""}...`);
  
  const command = new Deno.Command(Deno.execPath(), {
    args,
    stdout: "inherit",
    stderr: "inherit",
  });

  const { success, code } = await command.output();

  if (!success) {
    console.error(`❌ Deployment failed with exit code ${code}`);
    Deno.exit(code);
  }

  console.log("✅ Deployment successful!");

  if (isProd) {
    console.log("🔗 Automatically registering production webhook...");
    const webhookCmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", "--env-file=.env", "scripts/set_webhook.ts"],
      stdout: "inherit",
      stderr: "inherit",
    });
    const { success: webhookSuccess } = await webhookCmd.output();
    if (!webhookSuccess) {
      console.warn("⚠️ Webhook registration failed, but deployment succeeded. Please run 'deno task set-webhook' manually.");
    } else {
      console.log("✅ Webhook auto-registered.");
    }
  }
}

if (import.meta.main) {
  main();
}

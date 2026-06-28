CREATE TABLE "previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_sha" text NOT NULL,
	"scenario_key" text NOT NULL,
	"segments" jsonb NOT NULL,
	"raw_stdout" text NOT NULL,
	"exit_code" integer NOT NULL,
	"timed_out" integer NOT NULL,
	"trace" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

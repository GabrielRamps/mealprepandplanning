CREATE TYPE "public"."core_buy_mode" AS ENUM('by_amount', 'restock');--> statement-breakpoint
CREATE TYPE "public"."core_component_role" AS ENUM('protein', 'starch', 'vegetable', 'fat', 'other');--> statement-breakpoint
CREATE TYPE "public"."core_food_category" AS ENUM('protein', 'starch', 'vegetable', 'fruit', 'dairy_eggs', 'grain', 'fat', 'flavor', 'supplement', 'snack');--> statement-breakpoint
CREATE TYPE "public"."core_unit_kind" AS ENUM('weight', 'count');--> statement-breakpoint
CREATE TYPE "public"."eater_kind" AS ENUM('member', 'guest');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('manual', 'receipt', 'seed');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "core_food_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"core_food_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"package_amount" numeric(10, 2) NOT NULL,
	"source" "price_source" NOT NULL,
	"receipt_scan_id" uuid,
	"observed_on" date NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core_foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"ingredient_id" uuid,
	"name" text NOT NULL,
	"category" "core_food_category" NOT NULL,
	"unit_kind" "core_unit_kind" DEFAULT 'weight' NOT NULL,
	"grams_per_count" numeric(8, 2),
	"kcal_100g" numeric(6, 1) NOT NULL,
	"protein_100g" numeric(5, 1) NOT NULL,
	"carbs_100g" numeric(5, 1) DEFAULT 0 NOT NULL,
	"fat_100g" numeric(5, 1) DEFAULT 0 NOT NULL,
	"fiber_100g" numeric(5, 1) DEFAULT 0 NOT NULL,
	"cooked_yield" numeric(4, 2) DEFAULT 1 NOT NULL,
	"display_cup_g" numeric(6, 1),
	"package_label" text NOT NULL,
	"package_amount" numeric(10, 2) NOT NULL,
	"package_price_cents" integer NOT NULL,
	"price_is_estimate" boolean DEFAULT true NOT NULL,
	"price_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"buy_mode" "core_buy_mode" DEFAULT 'by_amount' NOT NULL,
	"restock_weeks" smallint,
	"walmart_name" text,
	"walmart_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "core_foods_package_amount" CHECK ("core_foods"."package_amount" > 0),
	CONSTRAINT "core_foods_price" CHECK ("core_foods"."package_price_cents" >= 0),
	CONSTRAINT "core_foods_restock_weeks" CHECK ("core_foods"."restock_weeks" between 1 and 26),
	CONSTRAINT "core_foods_count_grams" CHECK ("core_foods"."unit_kind" = 'weight' or "core_foods"."grams_per_count" is not null),
	CONSTRAINT "core_foods_restock" CHECK ("core_foods"."buy_mode" = 'by_amount' or "core_foods"."restock_weeks" is not null)
);
--> statement-breakpoint
CREATE TABLE "core_meal_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"core_meal_id" uuid NOT NULL,
	"role" "core_component_role" NOT NULL,
	"label" text,
	"swap_category" "core_food_category",
	"default_food_id" uuid NOT NULL,
	"prep_as" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core_meal_portions" (
	"component_id" uuid NOT NULL,
	"eater_id" uuid NOT NULL,
	"amount" numeric(8, 2) NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	CONSTRAINT "core_meal_portions_component_id_eater_id_pk" PRIMARY KEY("component_id","eater_id"),
	CONSTRAINT "core_meal_portions_amount" CHECK ("core_meal_portions"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "core_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"is_flex" boolean DEFAULT false NOT NULL,
	"flavor_ideas" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "prep_eaters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" "eater_kind" NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"color" text DEFAULT 'neutral' NOT NULL,
	"slots" "meal_slot"[] DEFAULT '{breakfast,lunch,dinner,snack}' NOT NULL,
	"kcal_target" integer,
	"protein_target_g" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prep_eaters_kcal" CHECK ("prep_eaters"."kcal_target" between 1000 and 5000),
	CONSTRAINT "prep_eaters_protein" CHECK ("prep_eaters"."protein_target_g" between 40 and 350),
	CONSTRAINT "prep_eaters_member_user" CHECK (("prep_eaters"."kind" = 'member') = ("prep_eaters"."user_id" is not null)),
	CONSTRAINT "prep_eaters_member_targets" CHECK ("prep_eaters"."kind" = 'guest' or ("prep_eaters"."kcal_target" is not null and "prep_eaters"."protein_target_g" is not null))
);
--> statement-breakpoint
CREATE TABLE "prep_settings" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"weekly_budget_cents" integer DEFAULT 17500 NOT NULL,
	"prep_weekdays" smallint[] DEFAULT '{0,3}' NOT NULL,
	"double_weekdays" smallint[] DEFAULT '{1,3}' NOT NULL,
	"guests_default" boolean DEFAULT false NOT NULL,
	"rotation" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prep_settings_budget" CHECK ("prep_settings"."weekly_budget_cents" between 0 and 1000000)
);
--> statement-breakpoint
CREATE TABLE "prep_task_checks" (
	"prep_week_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"checked_by" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prep_task_checks_prep_week_id_task_key_pk" PRIMARY KEY("prep_week_id","task_key")
);
--> statement-breakpoint
CREATE TABLE "prep_template_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"for_note" text,
	"aisle" "aisle" DEFAULT 'condiments' NOT NULL,
	"price_cents" integer,
	"is_pantry" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prep_template_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"core_meal_id" uuid,
	"recipe_id" uuid,
	"servings" numeric(6, 2),
	"leftover_of_weekday" smallint,
	"choices" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"flavor" text,
	"is_double" boolean DEFAULT false NOT NULL,
	"no_prep" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "prep_template_meals_weekday" CHECK ("prep_template_meals"."weekday" between 1 and 7),
	CONSTRAINT "prep_template_meals_leftover_weekday" CHECK ("prep_template_meals"."leftover_of_weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "prep_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "prep_week_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prep_week_id" uuid NOT NULL,
	"name" text NOT NULL,
	"for_note" text,
	"aisle" "aisle" DEFAULT 'condiments' NOT NULL,
	"price_cents" integer,
	"is_pantry" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prep_week_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prep_week_id" uuid NOT NULL,
	"day" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"core_meal_id" uuid,
	"recipe_id" uuid,
	"servings" numeric(6, 2),
	"leftover_of" uuid,
	"choices" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"flavor" text,
	"is_double" boolean DEFAULT false NOT NULL,
	"no_prep" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prep_week_meals_one_entry" CHECK (num_nonnulls("prep_week_meals"."core_meal_id", "prep_week_meals"."recipe_id", "prep_week_meals"."leftover_of") = 1),
	CONSTRAINT "prep_week_meals_servings" CHECK ("prep_week_meals"."recipe_id" is null or "prep_week_meals"."servings" > 0),
	CONSTRAINT "prep_week_meals_double_dinner" CHECK (not "prep_week_meals"."is_double" or "prep_week_meals"."slot" = 'dinner')
);
--> statement-breakpoint
CREATE TABLE "prep_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"template_id" uuid,
	"budget_cents" integer NOT NULL,
	"guests_on" boolean DEFAULT false NOT NULL,
	"restock_buy" uuid[] DEFAULT '{}' NOT NULL,
	"list_built_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prep_weeks_week_start_monday" CHECK (extract(isodow from "prep_weeks"."week_start") = 1)
);
--> statement-breakpoint
CREATE TABLE "receipt_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"image_keys" text[] NOT NULL,
	"status" "receipt_status" DEFAULT 'processing' NOT NULL,
	"model" text,
	"store" text,
	"lines" jsonb,
	"receipt_total_cents" integer,
	"error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "grocery_items" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "grocery_items" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "grocery_lists" ADD COLUMN "prep_week_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_list_items" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "saved_list_items" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "core_food_prices" ADD CONSTRAINT "core_food_prices_core_food_id_core_foods_id_fk" FOREIGN KEY ("core_food_id") REFERENCES "public"."core_foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_food_prices" ADD CONSTRAINT "core_food_prices_receipt_scan_id_receipt_scans_id_fk" FOREIGN KEY ("receipt_scan_id") REFERENCES "public"."receipt_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_foods" ADD CONSTRAINT "core_foods_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_foods" ADD CONSTRAINT "core_foods_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_meal_components" ADD CONSTRAINT "core_meal_components_core_meal_id_core_meals_id_fk" FOREIGN KEY ("core_meal_id") REFERENCES "public"."core_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_meal_components" ADD CONSTRAINT "core_meal_components_default_food_id_core_foods_id_fk" FOREIGN KEY ("default_food_id") REFERENCES "public"."core_foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_meal_portions" ADD CONSTRAINT "core_meal_portions_component_id_core_meal_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."core_meal_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_meal_portions" ADD CONSTRAINT "core_meal_portions_eater_id_prep_eaters_id_fk" FOREIGN KEY ("eater_id") REFERENCES "public"."prep_eaters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_meals" ADD CONSTRAINT "core_meals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_eaters" ADD CONSTRAINT "prep_eaters_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_settings" ADD CONSTRAINT "prep_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_task_checks" ADD CONSTRAINT "prep_task_checks_prep_week_id_prep_weeks_id_fk" FOREIGN KEY ("prep_week_id") REFERENCES "public"."prep_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_template_extras" ADD CONSTRAINT "prep_template_extras_template_id_prep_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prep_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_template_meals" ADD CONSTRAINT "prep_template_meals_template_id_prep_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prep_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_template_meals" ADD CONSTRAINT "prep_template_meals_core_meal_id_core_meals_id_fk" FOREIGN KEY ("core_meal_id") REFERENCES "public"."core_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_template_meals" ADD CONSTRAINT "prep_template_meals_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_templates" ADD CONSTRAINT "prep_templates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_week_extras" ADD CONSTRAINT "prep_week_extras_prep_week_id_prep_weeks_id_fk" FOREIGN KEY ("prep_week_id") REFERENCES "public"."prep_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_week_meals" ADD CONSTRAINT "prep_week_meals_prep_week_id_prep_weeks_id_fk" FOREIGN KEY ("prep_week_id") REFERENCES "public"."prep_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_week_meals" ADD CONSTRAINT "prep_week_meals_core_meal_id_core_meals_id_fk" FOREIGN KEY ("core_meal_id") REFERENCES "public"."core_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_week_meals" ADD CONSTRAINT "prep_week_meals_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_week_meals" ADD CONSTRAINT "prep_week_meals_leftover_of_prep_week_meals_id_fk" FOREIGN KEY ("leftover_of") REFERENCES "public"."prep_week_meals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_weeks" ADD CONSTRAINT "prep_weeks_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_weeks" ADD CONSTRAINT "prep_weeks_template_id_prep_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prep_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_scans" ADD CONSTRAINT "receipt_scans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "core_food_prices_food" ON "core_food_prices" USING btree ("core_food_id","observed_on" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "core_foods_household_name" ON "core_foods" USING btree ("household_id",lower("name")) WHERE "core_foods"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "core_foods_household_category" ON "core_foods" USING btree ("household_id","category") WHERE "core_foods"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "prep_eaters_household_user" ON "prep_eaters" USING btree ("household_id","user_id") WHERE "prep_eaters"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "prep_week_meals_week_day" ON "prep_week_meals" USING btree ("prep_week_id","day","slot","position");--> statement-breakpoint
CREATE UNIQUE INDEX "prep_weeks_household_week" ON "prep_weeks" USING btree ("household_id","week_start");--> statement-breakpoint
CREATE INDEX "receipt_scans_household_created" ON "receipt_scans" USING btree ("household_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "grocery_lists" ADD CONSTRAINT "grocery_lists_prep_week_id_prep_weeks_id_fk" FOREIGN KEY ("prep_week_id") REFERENCES "public"."prep_weeks"("id") ON DELETE set null ON UPDATE no action;
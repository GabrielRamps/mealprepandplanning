CREATE TABLE "saved_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_list_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(10, 3),
	"unit" text,
	"aisle" "aisle" DEFAULT 'other' NOT NULL,
	"is_pantry" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_list_recipes" (
	"saved_list_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"servings" numeric(6, 2) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "saved_list_recipes_saved_list_id_recipe_id_pk" PRIMARY KEY("saved_list_id","recipe_id"),
	CONSTRAINT "saved_list_recipes_servings" CHECK ("saved_list_recipes"."servings" > 0)
);
--> statement-breakpoint
CREATE TABLE "saved_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ordered_at" timestamp with time zone,
	CONSTRAINT "saved_lists_name_length" CHECK (char_length("saved_lists"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "grocery_lists" ADD COLUMN "saved_list_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_list_items" ADD CONSTRAINT "saved_list_items_saved_list_id_saved_lists_id_fk" FOREIGN KEY ("saved_list_id") REFERENCES "public"."saved_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_list_recipes" ADD CONSTRAINT "saved_list_recipes_saved_list_id_saved_lists_id_fk" FOREIGN KEY ("saved_list_id") REFERENCES "public"."saved_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_list_recipes" ADD CONSTRAINT "saved_list_recipes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_list_items_saved_list" ON "saved_list_items" USING btree ("saved_list_id");--> statement-breakpoint
CREATE INDEX "saved_lists_household" ON "saved_lists" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "grocery_lists" ADD CONSTRAINT "grocery_lists_saved_list_id_saved_lists_id_fk" FOREIGN KEY ("saved_list_id") REFERENCES "public"."saved_lists"("id") ON DELETE set null ON UPDATE no action;
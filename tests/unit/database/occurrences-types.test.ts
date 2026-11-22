import { expectTypeOf, test } from "vitest";
import type {
  Database,
  Tables,
  TablesInsert,
} from "@/lib/supabase/database.types";

test("a minimal occurrence insert needs only its condominium, origin, channel and description", () => {
  expectTypeOf<{
    condominium_id: string;
    origin: string;
    channel: string;
    description: string;
  }>().toExtend<TablesInsert<"occurrences">>();
  expectTypeOf<
    TablesInsert<"occurrences">["number"]
  >().toEqualTypeOf<undefined>();
  expectTypeOf<
    Tables<"occurrences">["registered_at"]
  >().toEqualTypeOf<string>();
  expectTypeOf<Tables<"occurrences">["final_priority"]>().toEqualTypeOf<
    string | null
  >();
  expectTypeOf<Tables<"occurrences">["responsible_profile_id"]>().toEqualTypeOf<
    string | null
  >();
});

test("event time, identity and private visibility are database defaults while author snapshots remain independent", () => {
  expectTypeOf<{
    occurrence_id: string;
    event_type: string;
    author_type: string;
    internal_description: string;
  }>().toExtend<TablesInsert<"occurrence_events">>();
  expectTypeOf<
    TablesInsert<"occurrence_events">["id"]
  >().toEqualTypeOf<undefined>();
  expectTypeOf<
    Tables<"occurrence_events">["author_profile_id"]
  >().toEqualTypeOf<string | null>();
  expectTypeOf<Tables<"occurrence_events">["author_phone"]>().toEqualTypeOf<
    string | null
  >();
  expectTypeOf<Tables<"occurrence_events">["public_text"]>().toEqualTypeOf<
    string | null
  >();
  expectTypeOf<
    Tables<"occurrence_events">["delegation_started_at"]
  >().toEqualTypeOf<string | null>();
});

test("generated attachment relationships preserve the composite event and occurrence foreign key", () => {
  type Relationship =
    Database["public"]["Tables"]["occurrence_attachments"]["Relationships"][0];
  expectTypeOf<Relationship["columns"]>().toEqualTypeOf<
    ["occurrence_id", "event_id"]
  >();
  expectTypeOf<
    Relationship["referencedRelation"]
  >().toEqualTypeOf<"occurrence_events">();
  expectTypeOf<Relationship["referencedColumns"]>().toEqualTypeOf<
    ["occurrence_id", "id"]
  >();
  expectTypeOf<{ event_id: number }>().not.toExtend<
    TablesInsert<"occurrence_attachments">
  >();
  expectTypeOf<{ occurrence_id: string }>().not.toExtend<
    TablesInsert<"occurrence_attachments">
  >();
});

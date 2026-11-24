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

test("tracking code is a required persisted string with a database insert default", () => {
  expectTypeOf<
    Tables<"occurrences">["tracking_code"]
  >().toEqualTypeOf<string>();
  expectTypeOf<TablesInsert<"occurrences">["tracking_code"]>().toEqualTypeOf<
    string | undefined
  >();
});

test("attachment insert requires event linkage and private file identification while identity and time default in the database", () => {
  type Insert = TablesInsert<"occurrence_attachments">;
  type Required = Pick<
    Insert,
    | "occurrence_id"
    | "event_id"
    | "storage_bucket"
    | "storage_path"
    | "file_name"
    | "content_type"
    | "size_bytes"
  >;
  expectTypeOf<Required>().toEqualTypeOf<{
    occurrence_id: string;
    event_id: number;
    storage_bucket: string;
    storage_path: string;
    file_name: string;
    content_type: string;
    size_bytes: number;
  }>();
  expectTypeOf<Required>().toExtend<Insert>();
  expectTypeOf<Insert["id"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<Insert["created_at"]>().toEqualTypeOf<string | undefined>();
});

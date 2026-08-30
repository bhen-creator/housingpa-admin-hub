import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { InternalToolConfig } from "@shared/toolCatalog";
import { Check, Link2, Plus, Save, Settings2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

function DestinationRow({ tool }: { tool: InternalToolConfig }) {
  const utils = trpc.useUtils();
  const [value, setValue] = useState(tool.destinationUrl);
  const mutation = trpc.tools.updateDestination.useMutation({
    onSuccess: async () => {
      await utils.tools.list.invalidate();
      toast.success(`${tool.name} destination saved.`);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => setValue(tool.destinationUrl), [tool.destinationUrl]);
  const hasChanges = value !== tool.destinationUrl;

  return (
    <div className="grid gap-4 border-b border-[#e0e5de] py-6 last:border-b-0 md:grid-cols-[minmax(180px,0.75fr)_minmax(280px,1.75fr)_auto] md:items-center">
      <div>
        <p className="font-semibold tracking-[-0.02em] text-[#213633]">
          {tool.name}
        </p>
        <p className="mt-1 text-xs leading-5 text-[#788680]">
          {tool.description}
        </p>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#628176]">
          {tool.operationalState.replaceAll("_", " ")}
        </p>
      </div>
      <div>
        <Label htmlFor={`${tool.slug}-url`} className="sr-only">
          {tool.name} destination URL
        </Label>
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#749587]" />
          <Input
            id={`${tool.slug}-url`}
            type="url"
            value={value}
            onChange={event => setValue(event.target.value)}
            placeholder="https://your-tool.housingpa.com"
            className="h-11 rounded-xl border-[#cfdad0] bg-[#fbfcfa] pl-9 text-sm shadow-none placeholder:text-[#a3afa7] focus-visible:ring-[#5c9784]"
          />
        </div>
        {!tool.destinationUrl ? (
          <p className="mt-1.5 text-xs text-[#9a7652]">
            No destination configured. The card remains disabled.
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-[#7d785e]">
            Saving a URL marks it configured but unverified. Launch remains
            disabled until evidence-backed verification is stored.
          </p>
        )}
      </div>
      <Button
        type="button"
        disabled={!hasChanges || mutation.isPending}
        onClick={() =>
          mutation.mutate({ slug: tool.slug, destinationUrl: value.trim() })
        }
        className="h-11 rounded-xl bg-[#2e6658] px-4 text-white hover:bg-[#245548] active:scale-[0.98]"
      >
        {mutation.isPending ? (
          "Saving…"
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Save
          </>
        )}
      </Button>
    </div>
  );
}

function FutureToolForm() {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const mutation = trpc.tools.addFutureTool.useMutation({
    onSuccess: async () => {
      setName("");
      setDescription("");
      setDestinationUrl("");
      await utils.tools.list.invalidate();
      toast.success("Future tool added to the hub.");
    },
    onError: error => toast.error(error.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate({ name, description, destinationUrl });
  };

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label
            htmlFor="future-tool-name"
            className="text-sm font-semibold text-[#2b413d]"
          >
            Tool name
          </Label>
          <Input
            id="future-tool-name"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="e.g., Operations Desk"
            required
            className="h-11 rounded-xl border-[#cfdad0] bg-white shadow-none focus-visible:ring-[#5c9784]"
          />
        </div>
        <div className="grid gap-2">
          <Label
            htmlFor="future-tool-url"
            className="text-sm font-semibold text-[#2b413d]"
          >
            Destination URL
          </Label>
          <Input
            id="future-tool-url"
            type="url"
            value={destinationUrl}
            onChange={event => setDestinationUrl(event.target.value)}
            placeholder="https://…"
            required
            className="h-11 rounded-xl border-[#cfdad0] bg-white shadow-none focus-visible:ring-[#5c9784]"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label
          htmlFor="future-tool-description"
          className="text-sm font-semibold text-[#2b413d]"
        >
          Short description
        </Label>
        <Textarea
          id="future-tool-description"
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder="What does this tool help the team accomplish?"
          required
          minLength={8}
          rows={3}
          className="resize-none rounded-xl border-[#cfdad0] bg-white shadow-none focus-visible:ring-[#5c9784]"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-[#73827d]">
          New tools appear as configured but unverified and cannot launch until
          verification is recorded.
        </p>
        <Button
          disabled={mutation.isPending}
          className="h-11 rounded-xl bg-[#2e6658] px-4 text-white hover:bg-[#245548] active:scale-[0.98]"
        >
          {mutation.isPending ? (
            "Adding…"
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Add tool
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export default function ToolSettings() {
  const toolQuery = trpc.tools.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const featuredTools = (toolQuery.data ?? []).filter(
    tool => tool.category === "featured"
  );

  return (
    <div className="min-h-screen bg-[#f5f4ef] px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-[#d9e0d8] pb-8">
          <div className="flex items-center gap-2 text-[#4d8977]">
            <Settings2 className="h-4 w-4" />
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]">
              Administration
            </p>
          </div>
          <h1 className="mt-4 font-serif text-4xl tracking-[-0.045em] text-[#172b29] sm:text-5xl">
            Tool settings
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#63736f] sm:text-base">
            Set the destination for each core application, then add future tools
            as your internal workspace grows.
          </p>
        </header>

        <section className="pt-8" aria-labelledby="destinations-heading">
          <div className="mb-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#5a8d7d]">
              Core applications
            </p>
            <h2
              id="destinations-heading"
              className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-[#203633]"
            >
              External destinations
            </h2>
          </div>
          <Card className="rounded-[1.5rem] border-[#dbe2da] bg-white shadow-[0_1px_0_rgba(20,45,40,0.04)]">
            <CardContent className="p-6 sm:p-8">
              {toolQuery.isLoading ? (
                <div className="space-y-6">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      className="h-20 rounded-xl bg-[#edf0eb]"
                    />
                  ))}
                </div>
              ) : toolQuery.isError ? (
                <p className="text-sm text-[#944d42]">
                  The configuration directory could not be loaded. Refresh and
                  try again.
                </p>
              ) : (
                featuredTools.map(tool => (
                  <DestinationRow key={tool.slug} tool={tool} />
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section
          className="mt-10 rounded-[1.75rem] border border-[#d6e2d9] bg-[#ebf0e9] p-6 sm:p-8"
          aria-labelledby="future-tool-form-heading"
        >
          <div className="flex gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#dceee6] text-[#2e6658]">
              <Plus className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#5a8d7d]">
                Expandable directory
              </p>
              <h2
                id="future-tool-form-heading"
                className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-[#203633]"
              >
                Add a future tool
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#63736f]">
                This keeps your next internal application just as easy to find
                as the tools your team uses today.
              </p>
            </div>
          </div>
          <div className="mt-7 border-t border-[#d1ddd3] pt-7">
            <FutureToolForm />
          </div>
        </section>

        <aside className="mt-8 flex items-start gap-3 rounded-2xl border border-[#d9e0d8] bg-white/60 p-5 text-sm leading-6 text-[#687873]">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#4d8977]" />
          <p>
            Only authenticated HousingPA administrators can view or update this
            directory. Production destinations require HTTPS, and a saved URL
            cannot open until a separate verification records evidence and a
            timestamp.
          </p>
        </aside>
      </div>
    </div>
  );
}

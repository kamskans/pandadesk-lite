import CodeBlock from "./CodeBlock";

export default function Install() {
  const snippet = `<script src="${location.origin}/widget.js" async></script>`;
  const js = `PandaDesk('open');   // also 'close' and 'toggle', e.g. from your own "Help" button`;
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Install</h1>
        <p className="text-sm text-stone-500">Put the chat on your website.</p>
      </div>
      <section className="space-y-3">
        <h2 className="font-semibold">Chat on your website</h2>
        <p className="text-sm text-stone-600">Paste before <code>&lt;/body&gt;</code> on any page. Works with React, Vue, plain HTML, anything. Add <code>data-position=&quot;left&quot;</code> to show it on the left.</p>
        <CodeBlock code={snippet} />
        <h3 className="pt-2 text-sm font-semibold">Open it from your own button</h3>
        <CodeBlock code={js} />
      </section>
      <section className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 text-sm">
        <div className="font-semibold">Try it</div>
        <p className="text-stone-600">Open <a className="underline" href="/chat" target="_blank" rel="noopener">the chat on its own page</a>. Ask something that&apos;s on your website, then something that isn&apos;t, and watch it land in your Inbox.</p>
      </section>
    </div>
  );
}

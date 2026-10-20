"use client";

import { FormEvent, Fragment, type ReactNode, useEffect, useId, useRef, useState } from "react";

import { MetadataList, MetadataListItem } from "@/components/app/admin/MetadataList";
import { Timestamp } from "@/components/app/admin/Timestamp";
import { FailureNotice } from "@/components/app/FailureNotice";
import { Notice } from "@/components/app/admin/Notice";
import { useOpenForm } from "@/components/admin/OpenForm";
import { useSubmitCheck } from "@/components/admin/useSubmitCheck";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { copy } from "@/i18n";
import {
  catalogStatus,
  type CatalogState,
  CURRENCIES,
  effectiveColumn,
  emptyPriceForm,
  formatPrice,
  getPrices,
  matchText,
  type Price,
  priceChangeOf,
  priceFormOf,
  type PriceChange,
  type PriceEntry,
  type PriceForm,
  type Prices,
  refreshCatalog,
  restorePrice,
  savePrice,
  UNITS,
  unitWord,
} from "@/lib/adminPrices";
import { toFailure, type Failure } from "@/lib/failure";
import { CloseIcon, FailureIcon } from "@/theme/icons";

const t = copy.admin.prices;
const services = copy.admin.dashboard.health.services;

type FormField = keyof PriceForm;

type FormMode = { kind: "add" } | { kind: "edit"; entry: PriceEntry } | { kind: "price" };

interface EntryRow {
  id: string;
  entry: PriceEntry;
}

/** 后台拉取目录时，隔多久再读一次单价，看它拉完没有。 */
const POLL_MS = 2000;

/** 单价表默认只列这么多行，其余点「显示全部」或筛选后才列出：预设和目录加起来有几十个模型。 */
const FOLDED_ROWS = 12;

/**
 * 「配置」页的单价卡：最近用过却没有单价的模型放在最上面（待办：一条提醒，每个模型一行，点一下就能
 * 按运行记录里的名字设单价）；在线目录的状态和「立即从目录刷新」；预设、后台设定过的和最近用过的模型，
 * 每行只列生效的单价和它来自哪一种，后台设定、目录、预设三种并列的对照在「修改」时列出；可以修改、
 * 恢复（回到目录或预设，都没有的就删除）、新增。「修改」在被修改的那一行下面展开（全后台唯一的行展开）。
 */
export function AdminPrices() {
  const [prices, setPrices] = useState<Prices | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [form, setForm] = useState<PriceForm | null>(null);
  // 配置页同一时间只开一个表单：别的配置项打开表单时，这里的收起（见 OpenForm）。
  const [isOpen, setOpen] = useOpenForm("prices");
  /** 是自己关的（取消、保存成功），不是被别的表单挤掉：只有这时才把焦点还回去。 */
  const closedHere = useRef(false);
  /** 表单在做什么：新增，修改一条（列出它的三种单价作参考），或给未设单价的模型设单价。后两种的提供方、
   * 模型和单位是定的，不能改：改了就成了另一条。 */
  const [mode, setMode] = useState<FormMode>({ kind: "add" });
  /** 每打开一次表单加一，用来把表单滚进视野、把焦点移进去；不跟着输入变。 */
  const [opened, setOpened] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  /** 打开表单的那个按钮；关掉表单（取消或保存）后焦点回到它，它不在了（「新增单价」随表单隐藏）就回到「新增单价」。 */
  const returnTo = useRef<HTMLElement | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  // 单价表在 ≥ 1024px 显示，更窄时换成行（DESIGN.md「Layout · 后台 · 表格」）。
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getPrices().then(setPrices, (e) => setFailure(toFailure(e)));
  }, []);

  const fetching = prices?.catalog.fetching ?? false;
  useEffect(() => {
    if (!fetching) return;
    const timer = setTimeout(() => getPrices().then(setPrices, (e) => setFailure(toFailure(e))), POLL_MS);
    return () => clearTimeout(timer);
  }, [fetching, prices]);

  async function refresh() {
    setBusy("refresh");
    setFailure(null);
    setNotice(null);
    try {
      const next = await refreshCatalog();
      setPrices(next);
      const status = catalogStatus(next.catalog);
      if (status === "fresh") setNotice(t.catalog.refreshed);
    } catch (e) {
      setFailure(toFailure(e));
    } finally {
      setBusy(null);
    }
  }

  async function run(id: string, request: () => Promise<Prices>, done: string) {
    setBusy(id);
    setFailure(null);
    setNotice(null);
    try {
      setPrices(await request());
      close(id === "save");
      setNotice(done);
    } catch (e) {
      setFailure(toFailure(e));
    } finally {
      setBusy(null);
    }
  }

  /** 收起表单；`returnFocus` 时（取消、保存成功）焦点回到打开它的按钮。 */
  function close(returnFocus: boolean) {
    closedHere.current = returnFocus;
    setForm(null);
    setOpen(false);
  }

  // 别的配置项打开了表单：这里的收起，焦点留在那边。
  useEffect(() => {
    if (!isOpen && form !== null) setForm(null);
  }, [isOpen, form]);

  function open(next: PriceForm, nextMode: FormMode) {
    const from = document.activeElement;
    returnTo.current = from instanceof HTMLElement ? from : null;
    setFailure(null);
    setNotice(null);
    setForm(next);
    setMode(nextMode);
    setOpened((n) => n + 1);
    setOpen(true);
  }

  // 打开表单时把它滚进视野，焦点移到第一个能填的框。
  useEffect(() => {
    const editor = editorRef.current;
    if (opened === 0 || !editor) return;
    editor.scrollIntoView({ block: "nearest", behavior: "smooth" });
    editor.querySelector<HTMLInputElement>("input:not([disabled])")?.focus({ preventScroll: true });
  }, [opened]);

  const formOpen = form !== null;
  useEffect(() => {
    if (formOpen || opened === 0 || !closedHere.current) return;
    closedHere.current = false;
    const back = returnTo.current?.isConnected ? returnTo.current : addRef.current;
    back?.focus();
    returnTo.current = null;
    // 只在表单关上的那一刻跑，`opened` 不算触发条件。
  }, [formOpen]);

  /** 一条单价的操作：修改，有后台设定时还能恢复（回到目录或预设，都没有的就删除）。 */
  function entryActions(id: string, entry: PriceEntry) {
    const restoreWord = entry.catalog ? t.restoreTo.catalog : entry.preset ? t.restoreTo.preset : t.remove;
    return (
      <div className="flex flex-wrap justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t.formTitle.edit(entry.model)}
          disabled={busy !== null}
          onClick={() => open(priceFormOf(entry), { kind: "edit", entry })}
        >
          {t.edit}
        </Button>
        {entry.override && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={copy.admin.actionOn(restoreWord, entry.model)}
            disabled={busy !== null}
            onClick={() => void run(id, () => restorePrice(entry), t.restored)}
          >
            {busy === id && <Spinner data-icon="inline-start" />}
            {restoreWord}
          </Button>
        )}
      </div>
    );
  }

  const matching = (prices?.prices ?? [])
    .map((entry) => ({ id: keyOf(entry), entry }))
    .filter(({ entry }) => matches(entry, query));
  const folded = query === "" && !showAll && matching.length > FOLDED_ROWS;
  const listed = folded ? matching.slice(0, FOLDED_ROWS) : matching;

  const editor = form && (
    <div ref={editorRef} className="flex max-w-xl flex-col gap-4 py-2">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium break-words">
          {mode.kind === "add" ? t.formTitle.add : t.formTitle[mode.kind](form.model)}
        </h3>
        {mode.kind !== "add" && (
          <p className="text-xs break-words text-muted-foreground">{t.formKey(form.provider, unitWord(form.unit))}</p>
        )}
      </div>
      {mode.kind === "edit" && <PriceReference entry={mode.entry} />}
      <PriceEditor
        key={opened}
        form={form}
        isKeyFixed={mode.kind !== "add"}
        onChange={setForm}
        busy={busy === "save"}
        onCancel={() => close(true)}
        onSave={(change) => void run("save", () => savePrice(change), t.saved)}
      />
    </div>
  );

  // 表单放在哪：修改时就地展开在那一行下面（宽屏是表格里那一行下面的一行，窄屏把列表在那一项后面断开）；
  // 设单价时在「未设单价」列表下面；新增时在最下面。
  const editingId = form && mode.kind === "edit" ? keyOf(mode.entry) : null;
  const editingAt = editingId === null ? -1 : listed.findIndex(({ id }) => id === editingId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t.title}</h2>
        </CardTitle>
        <CardDescription>{t.hint(prices?.preset_as_of ?? null)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notice && <Notice text={notice} onDismiss={() => setNotice(null)} />}
        {failure && <FailureNotice failure={failure} />}
        {!prices && !failure && (
          <p className="text-muted-foreground" role="status">
            {t.loading}
          </p>
        )}
        {prices && prices.unpriced.length > 0 && (
          <div className="flex flex-col gap-2">
            <Alert>
              <FailureIcon />
              <AlertTitle>{t.unpriced.title}</AlertTitle>
              <AlertDescription>{t.unpriced.hint}</AlertDescription>
            </Alert>
            <ul className="flex flex-col divide-y">
              {prices.unpriced.map((u) => (
                <li key={`${u.provider}|${u.model}|${u.unit}`} className="flex items-center gap-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="break-words">{u.model}</span>
                    <span className="text-xs break-words text-muted-foreground">
                      {`${services[u.service] ?? u.service} · ${u.provider} · ${unitWord(u.unit)}`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t.formTitle.price(u.model)}
                    disabled={busy !== null}
                    onClick={() =>
                      open(priceFormOf({ ...u, preset: null, catalog: null, override: null }), { kind: "price" })
                    }
                  >
                    {t.priceIt}
                  </Button>
                </li>
              ))}
            </ul>
            {mode.kind === "price" && editor}
          </div>
        )}
        {prices && (
          <div className="flex flex-wrap items-center gap-2">
            <CatalogLine state={prices.catalog} />
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null || prices.catalog.fetching}
              onClick={() => void refresh()}
            >
              {busy === "refresh" && <Spinner data-icon="inline-start" />}
              {t.catalog.refresh}
            </Button>
          </div>
        )}
        {prices && (
          <div className="flex flex-col gap-3">
            <InputGroup className="lg:max-w-80">
              <InputGroupInput
                type="search"
                aria-label={t.filter}
                placeholder={t.filter}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" aria-label={t.clearFilter} onClick={() => setQuery("")}>
                    <CloseIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
            {listed.length === 0 ? (
              <p className="text-muted-foreground">{t.noMatch}</p>
            ) : wide ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.columns.model}</TableHead>
                    <TableHead>{t.columns.unit}</TableHead>
                    <TableHead>{t.columns.effective}</TableHead>
                    <TableHead className="text-right">{t.columns.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listed.map(({ id, entry }) => (
                    <Fragment key={id}>
                      <TableRow data-state={id === editingId ? "selected" : undefined}>
                        <TableCell className="whitespace-normal">
                          <ModelName entry={entry} />
                        </TableCell>
                        <TableCell>{unitWord(entry.unit)}</TableCell>
                        <TableCell className="whitespace-normal">
                          <EffectivePrice entry={entry} />
                        </TableCell>
                        <TableCell>{entryActions(id, entry)}</TableCell>
                      </TableRow>
                      {/* 行展开：一条普通的 tr，不用 TableRow，表单上不铺悬停的底色。 */}
                      {id === editingId && (
                        <tr className="border-b">
                          <td colSpan={4} className="px-2 pb-4">
                            {editor}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col gap-2">
                <EntryList rows={editingAt < 0 ? listed : listed.slice(0, editingAt + 1)} actions={entryActions} />
                {editingAt >= 0 && editor}
                {editingAt >= 0 && <EntryList rows={listed.slice(editingAt + 1)} actions={entryActions} />}
              </div>
            )}
            {query === "" && matching.length > FOLDED_ROWS && (
              <div>
                <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
                  {showAll ? t.fold : t.showAll(matching.length)}
                </Button>
              </div>
            )}
          </div>
        )}
        {prices && !form && (
          <div>
            <Button ref={addRef} variant="outline" size="sm" onClick={() => open(emptyPriceForm(), { kind: "add" })} disabled={busy !== null}>
              {t.add}
            </Button>
          </div>
        )}
        {mode.kind === "add" && editor}
      </CardContent>
    </Card>
  );
}

/** 一条单价的键：提供方、模型、计费单位。 */
function keyOf(entry: PriceEntry): string {
  return `${entry.provider}|${entry.model}|${entry.unit}`;
}

/** 窄屏上代替单价表的行：模型名，副行是提供方、单位和生效单价，行尾是操作。 */
function EntryList({ rows, actions }: { rows: EntryRow[]; actions: (id: string, entry: PriceEntry) => ReactNode }) {
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y">
      {rows.map(({ id, entry }) => (
        <li key={id} className="flex items-start gap-3 py-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="break-words">{entry.model}</span>
            <span className="text-xs break-words text-muted-foreground">{`${entry.provider} · ${unitWord(entry.unit)}`}</span>
            <EffectivePrice entry={entry} />
          </div>
          {actions(id, entry)}
        </li>
      ))}
    </ul>
  );
}

/** 目录一列的附注：拉取日期，按原厂价格估算的写明对应哪个模型，目录里名字不同的也写明。 */
function catalogNote(entry: PriceEntry) {
  return (price: Price) => {
    const match = matchText(price);
    if (match && price.source === "catalog_upstream") return t.upstream(match);
    if (match && price.match?.model !== entry.model) return `${t.fetchedOn(price.as_of)} · ${t.listedAs(match)}`;
    return t.fetchedOn(price.as_of);
  };
}

/** 筛选：模型名或提供方里含有这几个字（不分大小写）。 */
function matches(entry: PriceEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || entry.model.toLowerCase().includes(q) || entry.provider.toLowerCase().includes(q);
}

/** 模型名，提供方小一号放在副行。 */
function ModelName({ entry }: { entry: PriceEntry }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="break-all">{entry.model}</span>
      <span className="text-xs break-all text-muted-foreground">{entry.provider}</span>
    </div>
  );
}

const COLUMNS = ["override", "catalog", "preset"] as const;

/** 一种单价的附注：后台设定的日期、目录的拉取日期和对应的模型、预设的整理日期。 */
function noteOf(entry: PriceEntry, column: (typeof COLUMNS)[number], price: Price): string {
  if (column === "override") return t.setOn(price.as_of);
  if (column === "preset") return t.asOf(price.as_of);
  return catalogNote(entry)(price);
}

/**
 * 生效的单价：价格和它来自哪一种（后台设定、目录、预设）。附注只留有新信息的：后台设定的日期，目录里
 * 按原厂价格估算或名字不同时对应哪个模型；目录的拉取日期在表格上方、预设的整理日期在这一节的说明里，
 * 每行重复一遍只是噪音，修改时的对照里才逐条列出。另外两种单价也只在修改时列出。
 */
function EffectivePrice({ entry }: { entry: PriceEntry }) {
  const column = effectiveColumn(entry);
  const price = column && entry[column];
  if (!column || !price) return <span className="text-muted-foreground">{t.none}</span>;
  const full = noteOf(entry, column, price);
  const note = column === "override" || (column === "catalog" && full !== t.fetchedOn(price.as_of)) ? full : null;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="tabular-nums">{formatPrice(price, entry.unit)}</span>
        <Badge variant={column === "override" ? "secondary" : "outline"}>{t.columns[column]}</Badge>
      </div>
      {note && <span className="text-xs break-words text-muted-foreground">{note}</span>}
    </div>
  );
}

/** 修改时作参考：这条的三种单价，生效的那一种标上「生效」。 */
function PriceReference({ entry }: { entry: PriceEntry }) {
  const column = effectiveColumn(entry);
  return (
    <MetadataList>
      {COLUMNS.map((c) => {
        const price = entry[c];
        return (
          <MetadataListItem key={c} label={t.columns[c]}>
            {price ? (
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="tabular-nums">{formatPrice(price, entry.unit)}</span>
                  {column === c && <Badge variant="secondary">{t.inEffect}</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">{noteOf(entry, c, price)}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{t.none}</span>
            )}
          </MetadataListItem>
        );
      })}
    </MetadataList>
  );
}

/** 在线目录的状态：拉取时间，或者正在拉取、从没拉取成功、最近一次拉取失败的原因。 */
function CatalogLine({ state }: { state: CatalogState }) {
  const status = catalogStatus(state);
  if (status === "fetching" || status === "never") {
    return (
      <p className="text-muted-foreground" role="status">
        {status === "fetching" ? t.catalog.fetching : t.catalog.never}
      </p>
    );
  }
  if (status === "unreachable") return <p className="text-muted-foreground">{t.catalog.unreachable(state.error ?? "")}</p>;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-muted-foreground">
        {t.catalog.fresh} <Timestamp value={state.fetched_at ?? ""} />
      </p>
      {status === "kept" && (
        <p className="text-xs break-words text-muted-foreground">
          {t.catalog.kept(state.error ?? "")}（{t.catalog.failedAt} <Timestamp value={state.failed_at ?? ""} />）
        </p>
      )}
    </div>
  );
}

/** 单价表单。`isKeyFixed` 时（修改一条、给未设单价的模型设单价）提供方、模型和单位写在标题里，
 * 这里不列：只填单价和币种。 */
function PriceEditor({
  form,
  isKeyFixed,
  onChange,
  busy,
  onCancel,
  onSave,
}: {
  form: PriceForm;
  isKeyFixed: boolean;
  onChange: (form: PriceForm) => void;
  busy: boolean;
  onCancel: () => void;
  onSave: (change: PriceChange) => void;
}) {
  const id = useId();
  const result = priceChangeOf(form);
  // 刚打开的空表单不先报「不能为空」：点过一次保存才标出所有不对的项（见 useSubmitCheck）。
  // 每次打开表单换 key，重新开始。
  const check = useSubmitCheck<HTMLFormElement>();
  const set = (field: FormField) => (value: string) => onChange({ ...form, [field]: value });
  const problemOf = (field: FormField) =>
    check.shown && "problems" in result ? (result.problems.find((p) => p.field === field) ?? null) : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if ("change" in result) onSave(result.change);
    else check.refuse();
  }

  function text(field: "provider" | "model" | "input" | "output" | "cacheRead") {
    const label = t.fields[field];
    const problem = problemOf(field);
    const fieldId = `${id}-${field}`;
    return (
      <Field data-invalid={problem ? true : undefined}>
        <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
        <Input
          id={fieldId}
          value={form[field]}
          onChange={(event) => set(field)(event.target.value)}
          aria-invalid={problem ? true : undefined}
          autoComplete="off"
        />
        <FieldDescription>{t.formHints[field]}</FieldDescription>
        {problem && <FieldError>{t.problems[problem.reason](label)}</FieldError>}
      </Field>
    );
  }

  function select(field: "unit" | "currency", options: { value: string; label: string }[]) {
    const fieldId = `${id}-${field}`;
    return (
      <Field>
        <FieldLabel htmlFor={fieldId}>{t.fields[field]}</FieldLabel>
        <Select items={options} value={form[field]} onValueChange={(value) => value && set(field)(String(value))}>
          <SelectTrigger id={fieldId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  return (
    <form ref={check.ref} onSubmit={submit} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        {!isKeyFixed && text("provider")}
        {!isKeyFixed && text("model")}
        {!isKeyFixed && select("unit", UNITS.map((u) => ({ value: u, label: t.units[u] ?? u })))}
        {select("currency", CURRENCIES.map((c) => ({ value: c, label: t.currencies[c] ?? c })))}
        {text("input")}
        {text("output")}
        {form.unit === "tokens" && text("cacheRead")}
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {t.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {copy.common.cancel}
        </Button>
      </div>
    </form>
  );
}

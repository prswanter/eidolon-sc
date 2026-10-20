"use client";

import NextLink from "next/link";
import { useCallback, useEffect, useId, useState } from "react";

import { AppLink } from "@/components/app/AppLink";
import { FailureNotice } from "@/components/app/FailureNotice";
import { AdminPage } from "@/components/app/admin/AdminPage";
import { Timestamp } from "@/components/app/admin/Timestamp";
import { BanUserDialog } from "@/components/BanUserDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { copy } from "@/i18n";
import {
  USER_SORTS,
  USERS_PAGE_SIZE,
  banAction,
  describeLimits,
  headerSort,
  listAdminUsers,
  unbanUser,
  type AdminUser,
  type AdminUserPage,
  type UserSort,
} from "@/lib/adminUsers";
import { formatCount } from "@/lib/dashboard";
import { toFailure, type Failure } from "@/lib/failure";
import { PROVIDER_LABELS } from "@/lib/signIn";
import { cn } from "@/lib/utils";
import { BackIcon, CloseIcon, ForwardIcon, SearchIcon, SortableIcon, SortedIcon } from "@/theme/icons";

const t = copy.admin.users;

/** 输入停下这么久（毫秒）再去搜索，免得每敲一个字就问一次后端。 */
const SEARCH_DELAY = 300;

/**
 * 后台的「用户」页：搜索框、一行一位用户和分页。点名字进入这位用户的详情；管理者那一行没有封禁按钮。
 * 宽屏（≥ 1280px）是装在 Card 里的表格：用户（登录方式在副行）、24 小时用量、最后活跃、状态（封禁、
 * 单独限额合在一格）、操作；点「24 小时回合」「24 小时通话」的表头按它从多到少排（后端排好再分页），
 * 再点一次恢复按注册时间。更窄时（平板竖屏，或手机上外出处理刷量）换成 divide-y 的行：名字、24 小时用量、
 * 状态，封禁键在行尾，排序改用搜索框下的选择框（DESIGN.md「Layout · 后台 · 表格」）。
 */
export function AdminUserList() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<UserSort>("newest");
  const [result, setResult] = useState<AdminUserPage | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [banning, setBanning] = useState<AdminUser | null>(null);
  const [unbanning, setUnbanning] = useState<string | null>(null);
  const sortId = useId();

  const load = useCallback(async () => {
    try {
      setResult(await listAdminUsers(query, page, sort));
      setFailure(null);
    } catch (e) {
      setFailure(toFailure(e));
    }
  }, [query, page, sort]);

  useEffect(() => {
    const timer = setTimeout(load, SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [load]);

  function search(value: string) {
    setQuery(value);
    setPage(1);
  }

  function sortBy(next: UserSort) {
    setSort(next);
    setPage(1);
  }

  async function unban(user: AdminUser) {
    setUnbanning(user.id);
    try {
      await unbanUser(user.id);
      await load();
    } catch (e) {
      setFailure(toFailure(e));
    } finally {
      setUnbanning(null);
    }
  }

  /** 一行的操作：封禁或解除封禁（ghost sm，DESIGN.md「Buttons」）；管理者没有。 */
  function rowAction(user: AdminUser) {
    const action = banAction(user);
    if (action === "ban") {
      return (
        <Button variant="ghost" size="sm" aria-label={copy.admin.actionOn(t.ban, user.name)} onClick={() => setBanning(user)}>
          {t.ban}
        </Button>
      );
    }
    if (action === "unban") {
      const busy = unbanning === user.id;
      return (
        <Button
          variant="ghost"
          size="sm"
          aria-label={copy.admin.actionOn(t.unban, user.name)}
          disabled={busy}
          onClick={() => unban(user)}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {t.unban}
        </Button>
      );
    }
    return null;
  }

  /** 可以排序的表头：点一下按这一列从多到少排，再点一下恢复按注册时间。 */
  function sortableHead(column: "turns" | "calls", label: string) {
    const sorted = sort === column;
    const Icon = sorted ? SortedIcon : SortableIcon;
    return (
      <TableHead aria-sort={sorted ? "descending" : "none"} className="text-right">
        <button
          type="button"
          onClick={() => sortBy(headerSort(sort, column))}
          className="inline-flex items-center gap-1 rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {label}
          <Icon aria-hidden className={cn("size-3.5", !sorted && "text-muted-foreground")} />
        </button>
      </TableHead>
    );
  }

  const pages = result ? Math.ceil(result.total / USERS_PAGE_SIZE) : 0;

  return (
    <AdminPage width="wide" title={copy.admin.pages.users} intro={t.intro}>
      <div className="flex flex-col gap-3">
        <InputGroup className="md:w-80">
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={t.search}
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(e) => search(e.target.value)}
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label={t.clearSearch} onClick={() => search("")}>
                <CloseIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <div className="flex items-center gap-2 xl:hidden">
          <Label htmlFor={sortId}>{t.sort.label}</Label>
          <Select
            items={USER_SORTS.map((value) => ({ value, label: t.sort[value] }))}
            value={sort}
            onValueChange={(value) => value && sortBy(value as UserSort)}
          >
            <SelectTrigger id={sortId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USER_SORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t.sort[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {result && <p className="text-sm text-muted-foreground tabular-nums">{t.total(result.total)}</p>}
      </div>

      {failure && <FailureNotice failure={failure} />}

      {result && result.users.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t.empty}</EmptyTitle>
            <EmptyDescription>{t.emptyHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {result && result.users.length > 0 && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent>
              <Table className="hidden xl:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.columns.user}</TableHead>
                    {sortableHead("turns", t.columns.turns24h)}
                    {sortableHead("calls", t.columns.calls24h)}
                    <TableHead>{t.columns.lastActive}</TableHead>
                    <TableHead>{t.columns.status}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t.columns.actions}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="align-top whitespace-normal">
                        <div className="flex flex-wrap items-center gap-2">
                          <AppLink href={`/admin/users/${user.id}`} isStandalone>
                            {user.name}
                          </AppLink>
                          {user.is_admin && <AdminBadge />}
                        </div>
                        <SignInSummary user={user} />
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {formatCount(user.usage_24h.turns)}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {formatCount(user.usage_24h.calls)}
                      </TableCell>
                      <TableCell className="align-top">
                        <LastActive user={user} />
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        <StatusBadges user={user} />
                      </TableCell>
                      <TableCell className="text-right align-top">{rowAction(user)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <ul className="divide-y xl:hidden">
                {result.users.map((user) => (
                  <li key={user.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <NextLink
                      href={`/admin/users/${user.id}`}
                      className="group flex min-w-0 flex-1 flex-col items-start gap-1 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="font-medium break-words group-hover:underline">{user.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {t.usage24h(formatCount(user.usage_24h.turns), formatCount(user.usage_24h.calls))}
                      </span>
                      <StatusBadges user={user} withAdmin />
                    </NextLink>
                    {rowAction(user)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {pages > 1 && (
            <nav aria-label={t.pagination} className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <BackIcon data-icon="inline-start" />
                {t.previousPage}
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {t.pageOf(page, pages)}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                {t.nextPage}
                <ForwardIcon data-icon="inline-end" />
              </Button>
            </nav>
          )}
        </div>
      )}

      <BanUserDialog
        user={banning}
        onClose={() => setBanning(null)}
        onBanned={() => {
          setBanning(null);
          load();
        }}
      />
    </AdminPage>
  );
}

/** 登录方式缩成一行副字：「Google z@…」，多种用「·」隔开；没有时照说。 */
function SignInSummary({ user }: { user: AdminUser }) {
  return (
    <p className="mt-0.5 text-xs break-words text-muted-foreground">
      {user.sign_in_methods.length === 0
        ? t.noSignInMethods
        : user.sign_in_methods
            .map((method) => `${PROVIDER_LABELS[method.provider]} ${method.email ?? method.display_name}`)
            .join(" · ")}
    </p>
  );
}

function LastActive({ user }: { user: AdminUser }) {
  return user.last_active_at ? (
    <Timestamp value={user.last_active_at} format="auto" />
  ) : (
    <span className="text-muted-foreground">{t.never}</span>
  );
}

/** 「管理者」：secondary Badge（DESIGN.md「Admin status & charts」）。 */
export function AdminBadge() {
  return <Badge variant="secondary">{t.admin}</Badge>;
}

/** 状态一格：封禁与否，再加上有才显示的单独限额。窄屏的行里名字只是纯文字，管理者标签
 * 也放进这里（`withAdmin`）；宽屏上它跟在名字后面。 */
function StatusBadges({ user, withAdmin = false }: { user: AdminUser; withAdmin?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {withAdmin && user.is_admin && <AdminBadge />}
      <BanStatus banned={user.banned} />
      {user.limits && (
        <Badge variant="outline">{t.limitsToken(describeLimits(user.limits))}</Badge>
      )}
    </span>
  );
}

/** 封禁了是 destructive Badge「已封禁」，没有就只写 muted 的「正常」。 */
export function BanStatus({ banned }: { banned: boolean }) {
  return banned ? (
    <Badge variant="destructive">{t.banned}</Badge>
  ) : (
    <span className="text-sm text-muted-foreground">{t.active}</span>
  );
}

/** 单独限额：没有时「跟随全站」，有时列出回合和通话各自的数字（没设的一项跟随全站）。 */
export function UserLimits({ user }: { user: AdminUser }) {
  if (!user.limits) return <span className="text-muted-foreground">{t.limits.default}</span>;
  return <span>{describeLimits(user.limits)}</span>;
}

/**
 * 把文案里的 `{名字}` 换成值（例如一个链接），返回可以直接放进 JSX 的片段。
 * 句中带链接的文案用它：占位符的位置由各语言自己决定，组件里不拼句子。
 * 值里没有的占位符原样留下，漏传一眼就能看出来。
 */
export function interpolate<T>(text: string, values: Record<string, T>): (string | T)[] {
  return text
    .split(/(\{\w+\})/)
    .filter((part) => part !== "")
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      return name !== undefined && name in values ? values[name] : part;
    });
}

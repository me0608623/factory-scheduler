// Confirm a manual preview only when it still describes the current board.
// Keeping this check separate from the UI makes a silent no-op impossible.
export function acceptManualPreview(current, proposal) {
  if (!proposal || proposal.problems?.length) throw new Error('這個預覽有未解決問題，排程沒有改動');
  if (JSON.stringify(current) !== proposal.base) throw new Error('排程已更新，請重新預覽後再套用');
  const target = proposal.move;
  const block = proposal.after?.blocks?.find(b => b.id === target?.id);
  if (!block || block.date !== target.date || block.m !== target.m || block.s !== target.s || block.e !== target.e)
    throw new Error('預覽結果與目標時段不一致，排程沒有改動');
  if (JSON.stringify(current.blocks) === JSON.stringify(proposal.after.blocks))
    throw new Error('排程沒有實際變化，請重新選擇時段');
  return {state: proposal.after, block};
}

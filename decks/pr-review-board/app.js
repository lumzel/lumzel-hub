const context = await deck.context();
document.documentElement.dataset.theme = context.theme;

document.getElementById('review-btn')?.addEventListener('click', () => {
  deck.agent.send('请对当前工作区相对于主分支的改动执行 Standards 与 Spec 双轴代码审查。');
});

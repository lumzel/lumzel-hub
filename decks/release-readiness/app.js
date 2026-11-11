const context = await deck.context();
document.documentElement.dataset.theme = context.theme;

document.getElementById('audit-btn')?.addEventListener('click', () => {
  deck.agent.send('请检查当前工作区的未提交变更、最近提交记录与测试状态，生成一份发版就绪核验报告。');
});

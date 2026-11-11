const context = await deck.context();
document.documentElement.dataset.theme = context.theme;

document.getElementById('scan-btn')?.addEventListener('click', () => {
  deck.agent.send('请分析当前项目的模块边界、核心依赖关系与潜在耦合热点，并给出架构梳理总结。');
});

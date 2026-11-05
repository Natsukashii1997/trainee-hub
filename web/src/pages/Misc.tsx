import { Link, useNavigate } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import { Icon, Mark } from '../components/ui';

export function Login() {
  const nav = useNavigate();
  return (
    <div className="login">
      <div className="login-card">
        <div className="brand" style={{ padding: 0 }}><Mark /><div><b>管培生工作台</b><span>TRAINEE HUB</span></div></div>
        <h1>用飞书账号登录</h1>
        <p>在飞书里打开会自动登录。只有公司飞书成员能进入；首次登录后，管理员会为你分配角色。</p>
        <button className="btn pri" type="button" onClick={() => nav('/')}>使用飞书登录</button>
        <small>原型阶段点击即进入演示数据</small>
      </div>
    </div>
  );
}

const SOON: Record<string, { k: string; title: string; desc: string; items: string[] }> = {
  knowledge: { k: '二期', title: '知识', desc: '同步飞书「管培生知识库」，资料按阶段和岗位挂到任务上。', items: ['资料库：按标签筛选，点开跳飞书', 'FAQ：带教机器人审核入库的问答', '作品集：经本人同意的优秀产出'] },
  incentive: { k: '三期', title: '激励', desc: '积分只奖励对团队的贡献。一期起就在记录贡献，三期上线时按历史补算。', items: ['贡献榜：月榜与总榜', '我的积分明细', '兑换商城：AI 工具额度、学习资源、特权荣誉'] },
  admin: { k: '二期 / 三期', title: '更多后台功能', desc: '公告发布、积分规则与加权、兑换处理、标签维护、知识库同步设置、机器人接口密钥。', items: ['公告发布（二期）', '积分与兑换（三期）', '机器人接口密钥（一期 #17）'] },
};
export function Soon({ which }: { which: keyof typeof SOON }) {
  const s = SOON[which];
  return (
    <Sheet crumbs={[{ label: s.title }]}>
      <div className="soon-wrap"><div>
        <div className="k">{s.k}开放</div>
        <h1>{s.title}</h1>
        <p>{s.desc}</p>
        <ul>{s.items.map(i => <li key={i}>{i}</li>)}</ul>
        <Link className="btn sec" style={{ marginTop: 22 }} to="/"><Icon name="home" />回到首页</Link>
      </div></div>
    </Sheet>
  );
}

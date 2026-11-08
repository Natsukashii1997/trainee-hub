// 演示模式（PRD 2.2）：环境变量 TRAINEE_HUB_DEMO=1 打开，只能在本机地址上开。
// 打开后：顶栏可切换示例身份（演示登录），带教放行全部（authorize.ts）；只用合成数据（seed.ts）。
// 关闭时：第二轮完成飞书登录与对象级授权（PRD 下篇 R1）之前，所有业务接口一律拒绝。

const LOCAL_LISTEN = new Set(['127.0.0.1', 'localhost', '::1']);

/** 根据环境和监听地址决定是否开演示模式；要开但监听的不是本机地址时直接报错，不启动 */
export function resolveDemo(env: Record<string, string | undefined>, listenHost: string): boolean {
  if (env.TRAINEE_HUB_DEMO !== '1') return false;
  if (!LOCAL_LISTEN.has(listenHost)) throw new Error(`演示模式只能在本机地址上开，当前监听 ${listenHost}；去掉 TRAINEE_HUB_DEMO 或改为监听 127.0.0.1`);
  return true;
}

/** 演示身份放在这个 cookie 里，只在演示模式下认 */
export const DEMO_COOKIE = 'th_demo_user';

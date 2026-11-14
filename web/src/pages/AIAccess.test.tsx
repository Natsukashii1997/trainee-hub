// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider, ToastProvider } from '../components/ui';
import { AIAccess } from './Admin';

function mount(role: string) {
  localStorage.setItem('trainee-hub:demo-role', role);
  return render(<MemoryRouter initialEntries={['/admin/ai']}><SessionProvider><ToastProvider><Routes><Route path="/admin/ai" element={<AIAccess />} /></Routes></ToastProvider></SessionProvider></MemoryRouter>);
}

test('AI 与接入：不调用 AI 时默认执行方没有切换按钮，四块都在', () => {
  mount('admin');
  const exec = screen.getByRole('region', { name: '默认执行方' });
  expect(within(exec).getByText('无 · 本应用当前不调用 AI')).toBeTruthy();
  expect(within(exec).queryAllByRole('button')).toHaveLength(0);
  for (const name of ['功能清单', '功能链路', '对外开放', '数据对象']) expect(screen.getByRole('region', { name })).toBeTruthy();
  expect(within(screen.getByRole('region', { name: '对外开放' })).getByText('未配置')).toBeTruthy();
  cleanup();
});

test('AI 与接入：点功能看链路，AI 产出那一段标在工作台外', () => {
  mount('admin');
  const flow = () => screen.getByRole('region', { name: '功能链路' });
  expect(within(flow()).getByRole('heading', { name: '答疑答案草稿' })).toBeTruthy();
  expect(within(flow()).getAllByText('工作台外（机器人）')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: /这一步可以用 · 推荐 AI 资产/ }));
  expect(within(flow()).getByRole('heading', { name: '这一步可以用 · 推荐 AI 资产' })).toBeTruthy();
  expect(within(flow()).queryAllByText('工作台外（机器人）')).toHaveLength(0);
  expect(within(flow()).getByText('不需要（不是 AI 产出）')).toBeTruthy();
  cleanup();
});

test('AI 与接入：非管理员看到拦截说明', () => {
  mount('trainee');
  expect(screen.getByText('管理后台只对管理员开放')).toBeTruthy();
  expect(screen.queryByText('无 · 本应用当前不调用 AI')).toBeNull();
  cleanup();
});

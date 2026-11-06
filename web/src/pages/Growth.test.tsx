// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider, ToastProvider } from '../components/ui';
import { HandoffNotes, TaskDetail, MentorBoard } from './Growth';
import { Todo } from './Todo';
import * as api from '../data/api';
function mount(role: string, path: string, el: any, route: string) {
  localStorage.setItem('trainee-hub:demo-role', role);
  return render(<MemoryRouter initialEntries={[path]}><SessionProvider><ToastProvider><Routes><Route path={route} element={el} /></Routes></ToastProvider></SessionProvider></MemoryRouter>);
}
test('handoff: admin writes 许诺教研站', () => {
  mount('admin', '/h/st-u-xu-2', <HandoffNotes />, '/h/:stationId');
  expect(screen.getAllByText(/已过期限|待写/).length).toBeGreaterThan(0);
  const boxes = screen.getAllByRole('textbox');
  fireEvent.change(boxes[0], { target: { value: '教研拆解很扎实' } });
  fireEvent.click(screen.getByText('保存交接要点'));
  expect(api.handoverOf('st-u-xu-2')?.points).toEqual(['教研拆解很扎实']);
  expect(screen.getByText(/交接要点已保存/)).toBeTruthy();
  cleanup();
});
test('handoff: trainee blocked, exempt shown, next mentor read-only', () => {
  mount('trainee', '/h/st-u-lin-1', <HandoffNotes />, '/h/:stationId');
  expect(screen.getByText('交接要点只给相关带教和管理员看')).toBeTruthy(); cleanup();
  mount('admin', '/h/st-u-lin-0', <HandoffNotes />, '/h/:stationId');
  expect(screen.getByText(/免写/, { selector: 'b' })).toBeTruthy(); cleanup();
  mount('mentor', '/h/st-u-lin-2', <HandoffNotes />, '/h/:stationId');
  expect(screen.getByText(/你是下一站带教/)).toBeTruthy(); cleanup();
});
test('task detail: mentor reviews 需改进, then adjusts due', () => {
  mount('mentor', '/t/t-u-lin-tt-8', <TaskDetail />, '/t/:id');
  fireEvent.click(screen.getByText('需改进'));
  fireEvent.change(screen.getByPlaceholderText(/一两句就够/), { target: { value: '投诉场景再练' } });
  fireEvent.click(screen.getByText('提交点评'));
  expect(api.taskById('t-u-lin-tt-8')!.status).toBe('revise');
  expect(screen.getByText(/修改截止 /, { selector: '.toast' })).toBeTruthy();
  fireEvent.click(screen.getByText('改截止'));
  fireEvent.click(screen.getByText('保存并留痕'));
  expect(screen.getByText(/写一句原因/)).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText(/客户资料晚到/), { target: { value: '录音设备坏了' } });
  fireEvent.click(screen.getByText('保存并留痕'));
  expect(api.dueAdjustmentsOf('t-u-lin-tt-8').length).toBe(1);
  cleanup();
});
test('task detail: trainee resubmit needs change note; colleague blocked', () => {
  mount('trainee', '/t/t-u-lin-tt-8', <TaskDetail />, '/t/:id');
  expect(screen.getByText('上次评语 · 周颖', { exact: false })).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText(/feishu/), { target: { value: 'https://x.feishu.cn/docx/abc123' } });
  fireEvent.click(screen.getByText('再次提交'));
  expect(screen.getByRole('alert').textContent).toContain('修改说明');
  fireEvent.change(screen.getByPlaceholderText(/逐条写/), { target: { value: '补了投诉场景' } });
  fireEvent.click(screen.getByText('再次提交'));
  expect(api.taskById('t-u-lin-tt-8')!.status).toBe('submitted');
  cleanup();
  mount('colleague', '/t/t-u-lin-tt-8', <TaskDetail />, '/t/:id');
  expect(screen.getByText('这条任务你看不到')).toBeTruthy(); cleanup();
});
test('todo: mentor prepares, admin nudges once', () => {
  mount('mentor', '/todo', <Todo />, '/todo');
  fireEvent.click(screen.getByText('已准备'));
  expect(api.stationById('st-u-zhao-4')!.preparedAt).toBeTruthy();
  cleanup();
  mount('admin', '/todo', <Todo />, '/todo');
  expect(screen.getByText('有逾期的人')).toBeTruthy();
  fireEvent.click(screen.getByText('催一下'));
  expect(screen.getByText(/已催办/)).toBeTruthy();
  expect(screen.getByText('已催过')).toBeTruthy();
  fireEvent.click(screen.getByText('展开看'));
  expect(screen.getAllByText(/已完成|已撤销/).length).toBeGreaterThan(0);
  cleanup();
  mount('mentor', '/b', <MentorBoard />, '/b');
  expect(screen.getByText('人和进度')).toBeTruthy(); cleanup();
});

/**
 * Renderer 保留契约 —— ADR-010 R1
 *
 * ## 为什么光有版本号不够
 *
 * 快照里冻了 `narrative@1`。但如果有人：
 *   · 把 narrative@1 删掉
 *   · 改了它用的共享组件
 *   · 换了全局字体或设计 token
 *
 * 旧 Publication 的外观**照样会变**，甚至直接打不开 ——
 * 而 JSON 一个字节都没动。版本号只是把问题变得可检测，
 * 检测本身要靠下面这两组测试。
 *
 * ## golden 测试测的是什么
 *
 * 给定固定的快照 fixture，每个 renderer 版本的输出 HTML 必须逐字节不变。
 * 改了排版、改了共享组件、改了类名 —— 快照全部变红。
 *
 * 变红**不等于错**。它是一个提问：这次改动让同一份 config 的视觉结果
 * 变了吗？变了就要新增版本号；没变（比如只改注释）就更新 golden。
 * 这个提问必须发生，而不是悄悄合并。
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_GALLERY_CONFIG,
  DEFAULT_NARRATIVE_CONFIG,
  freezePresentation,
  RENDERER_TYPES,
  RENDERER_VERSIONS,
  type WorkSnapshot,
} from '@tc/domain';
import {
  RENDERER_REGISTRY,
  rendererKey,
  SnapshotView,
} from '@/components/studio/renderers';

/**
 * 固定 fixture。**不要改它** —— 改了 golden 就失去了参照物。
 * 要覆盖新形状就新增一个 fixture。
 */
function fixture(renderer: 'narrative' | 'gallery'): WorkSnapshot {
  return {
    _v: 2,
    work: { id: 'w-fixture', title: '保存与活着' },
    presentation: freezePresentation(
      renderer,
      renderer === 'narrative' ? DEFAULT_NARRATIVE_CONFIG : DEFAULT_GALLERY_CONFIG
    ),
    blocks: [
      { type: 'text', position: 0, text: '前言' },
      {
        type: 'moment_ref',
        position: 1,
        momentId: 'm-1',
        moment: {
          title: '秩父支路',
          occurredAt: '2026-03-14T07:20:00.000Z',
          placeLabel: '秩父神社',
          observations: [
            { id: 'o-1', content: '住家门口没有招牌。', recordedAt: '2026-03-14T07:25:00.000Z' },
          ],
          interpretation: {
            revisionId: 'r-1',
            content: '这里的人还打算住下去。',
            createdAt: '2026-03-14T14:00:00.000Z',
          },
          assets: [
            {
              role: 'contradicting',
              derivedHash: 'a'.repeat(64),
              objectKey: 'users/u1/sha256/aa/' + 'a'.repeat(64) + '.webp',
              mimeType: 'image/webp',
              width: 1600,
              height: 1200,
              note: '但这张让我不确定',
            },
          ],
        },
      },
      {
        type: 'moment_ref',
        position: 2,
        momentId: null,
        tombstone: {
          _v: 1,
          title: '商业主街',
          observations: ['每一块招牌都在互相盖过对方。'],
          deletedAt: '2026-05-01T00:00:00.000Z',
        },
      },
      { type: 'text', position: 3, text: '结论' },
    ],
  };
}

describe('Renderer 注册表', () => {
  it('RENDERER_VERSIONS 里的每个版本都有实现', () => {
    for (const type of RENDERER_TYPES) {
      const key = rendererKey(type, RENDERER_VERSIONS[type]);
      expect(RENDERER_REGISTRY[key], `${key} 没有实现`).toBeTypeOf('function');
    }
  });

  it('注册表里不允许有孤儿实现', () => {
    // 反向也要成立：注册了但 RENDERER_VERSIONS 里没有的版本，
    // 说明有人加了实现却没登记版本 —— 那个版本永远不会被发布用到。
    const declared = new Set<string>();
    for (const type of RENDERER_TYPES) {
      // 历史版本也算已声明：1..current
      for (let v = 1; v <= RENDERER_VERSIONS[type]; v += 1) {
        declared.add(rendererKey(type, v));
      }
    }
    for (const key of Object.keys(RENDERER_REGISTRY)) {
      expect(declared.has(key), `${key} 不在 RENDERER_VERSIONS 声明的范围内`).toBe(true);
    }
  });

  it('已声明的每个历史版本都必须还在 —— 被引用过的版本不能删', () => {
    for (const type of RENDERER_TYPES) {
      for (let v = 1; v <= RENDERER_VERSIONS[type]; v += 1) {
        const key = rendererKey(type, v);
        expect(
          RENDERER_REGISTRY[key],
          `${key} 被删了。已经用它发布过的页面会打不开（ADR-010 保留契约）`
        ).toBeTypeOf('function');
      }
    }
  });
});

describe('golden 输出', () => {
  it('narrative@1 的输出逐字节稳定', () => {
    const html = renderToStaticMarkup(
      <SnapshotView snapshot={fixture('narrative')} slug="保存与活着" />
    );
    expect(html).toMatchSnapshot();
  });

  it('gallery@1 的输出逐字节稳定', () => {
    const html = renderToStaticMarkup(
      <SnapshotView snapshot={fixture('gallery')} slug="保存与活着-gallery" />
    );
    expect(html).toMatchSnapshot();
  });

  it('两种表现渲染的是同一份内容 —— 文字部分完全一致', () => {
    const strip = (html: string) =>
      html
        .replace(/<[^>]+>/g, '\n')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .sort();

    const n = strip(renderToStaticMarkup(<SnapshotView snapshot={fixture('narrative')} slug="s" />));
    const g = strip(renderToStaticMarkup(<SnapshotView snapshot={fixture('gallery')} slug="s" />));
    // 排版不同、类名不同，但渲染出来的**文字**必须一字不差 ——
    // 差一句就说明某个 renderer 在决定内容
    expect(n).toEqual(g);
  });

  it('版本对不上时明确报错，绝不回退到最新版', () => {
    const snap = fixture('narrative');
    expect(() =>
      renderToStaticMarkup(
        <SnapshotView
          snapshot={{
            ...snap,
            presentation: { ...snap.presentation, rendererVersion: 99 },
          }}
          slug="s"
        />
      )
    ).toThrow(/PR-2/);
  });
});

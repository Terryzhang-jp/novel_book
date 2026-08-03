/**
 * UnitOfWork 的 PostgreSQL 实现
 *
 * ADR-000：标准 pg driver，没有任何平台 SDK。
 * 换一台普通的 PostgreSQL 就能跑，本地不需要 Docker、不需要平台账号。
 */

import type { Pool, PoolClient } from 'pg';
import type { CoreRepositories, UnitOfWork } from '@tc/application';
import { PostgresAssetRepository } from './asset-repository';
import { PostgresInterpretationRepository } from './interpretation-repository';
import { PostgresJourneyRepository } from './journey-repository';
import { PostgresMomentRepository } from './moment-repository';
import { PostgresObservationRepository } from './observation-repository';
import { PostgresPublicationRepository } from './publication-repository';
import { PostgresPublishedAssetRepository } from './published-asset-repository';
import { PostgresWorkRepository } from './work-repository';
import type { Queryable } from './queryable';

export function createRepositories(db: Queryable): CoreRepositories {
  return {
    journeys: new PostgresJourneyRepository(db),
    moments: new PostgresMomentRepository(db),
    observations: new PostgresObservationRepository(db),
    interpretations: new PostgresInterpretationRepository(db),
    works: new PostgresWorkRepository(db),
    publications: new PostgresPublicationRepository(db),
    assets: new PostgresAssetRepository(db),
    publishedAssets: new PostgresPublishedAssetRepository(db),
  };
}

export class PostgresUnitOfWork implements UnitOfWork {
  readonly journeys: CoreRepositories['journeys'];
  readonly moments: CoreRepositories['moments'];
  readonly observations: CoreRepositories['observations'];
  readonly interpretations: CoreRepositories['interpretations'];
  readonly works: CoreRepositories['works'];
  readonly publications: CoreRepositories['publications'];
  readonly assets: CoreRepositories['assets'];
  readonly publishedAssets: CoreRepositories['publishedAssets'];

  constructor(private readonly pool: Pool) {
    const repos = createRepositories(pool);
    this.journeys = repos.journeys;
    this.moments = repos.moments;
    this.observations = repos.observations;
    this.interpretations = repos.interpretations;
    this.works = repos.works;
    this.publications = repos.publications;
    this.assets = repos.assets;
    this.publishedAssets = repos.publishedAssets;
  }

  /**
   * 在一个事务里执行 fn。
   *
   * fn 拿到的是**绑到这条连接**的一整套新 repository —— 用 `this.journeys`
   * 那套会走连接池，跑在事务之外。那是这类代码最常见的 bug，
   * 而且症状极其隐蔽：平时都对，只有回滚的时候才发现有一半数据留下了。
   *
   * 回滚失败不吞：连接状态已经不可信，必须让它带着错误被销毁，
   * 而不是放回池子里给下一个请求用。
   */
  async transaction<T>(fn: (repos: CoreRepositories) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      const result = await fn(createRepositories(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // 回滚本身失败 —— 连接状态不可信，标记为坏连接
        broken = true;
      }
      throw err;
    } finally {
      // release(true) 会销毁连接而不是放回池子。
      // 把一条 ROLLBACK 都执行不了的连接还给下一个请求，
      // 后果是那个请求莫名其妙地继承了一个开着的事务。
      client.release(broken);
    }
  }
}

/**
 * useCanvasSync Hook
 *
 * 使用 BroadcastChannel API 实现多标签页同步
 * 当一个标签页保存成功后，通知其他标签页更新数据
 */

import { useEffect, useRef, useCallback } from "react";
import { useCanvasStore } from "../canvas-store";
import { toast } from "sonner";
import type { CanvasElement, CanvasViewport } from "@/types/storage";

// 消息类型
interface SyncMessage {
  type: "CANVAS_SAVED" | "CANVAS_UPDATED" | "REQUEST_SYNC";
  projectId: string;
  version: number;
  elements?: CanvasElement[];
  viewport?: CanvasViewport;
  timestamp: number;
  tabId: string;
}

// 生成唯一标签页 ID
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export function useCanvasSync(enabled: boolean = true) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const {
    projectId,
    projectVersion,
    elements,
    viewport,
    setServerData,
    hasUnsavedChanges,
  } = useCanvasStore();

  // 初始化 BroadcastChannel
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("BroadcastChannel" in window)) {
      return;
    }

    const channel = new BroadcastChannel("canvas_sync");
    channelRef.current = channel;

    // 处理来自其他标签页的消息
    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const message = event.data;

      // 忽略自己发送的消息
      if (message.tabId === TAB_ID) {
        return;
      }

      // 只处理同一项目的消息
      if (message.projectId !== projectId) {
        return;
      }

      switch (message.type) {
        case "CANVAS_SAVED":
          handleRemoteSave(message);
          break;
        case "REQUEST_SYNC":
          handleSyncRequest(message);
          break;
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [enabled, projectId]);

  // 处理远程保存
  const handleRemoteSave = useCallback(
    (message: SyncMessage) => {
      const currentVersion = useCanvasStore.getState().projectVersion;
      const currentHasUnsaved = useCanvasStore.getState().hasUnsavedChanges;

      // 如果远程版本更新
      if (message.version > currentVersion) {
        if (currentHasUnsaved) {
          // 本地有未保存的更改，提示用户
          toast.warning("其他标签页已更新画布", {
            description: "您有未保存的更改，请选择如何处理",
            duration: 10000,
            action: {
              label: "加载最新数据",
              onClick: () => {
                if (message.elements && message.viewport) {
                  setServerData({
                    elements: message.elements,
                    viewport: message.viewport,
                    version: message.version,
                  });
                  toast.success("已同步最新数据");
                }
              },
            },
          });
        } else {
          // 本地没有未保存的更改，直接更新
          if (message.elements && message.viewport) {
            setServerData({
              elements: message.elements,
              viewport: message.viewport,
              version: message.version,
            });
            toast.info("已从其他标签页同步数据");
          }
        }
      }
    },
    [setServerData]
  );

  // 处理同步请求
  const handleSyncRequest = useCallback(
    (message: SyncMessage) => {
      const state = useCanvasStore.getState();

      // 如果我们的版本更新，发送数据给请求方
      if (state.projectVersion > message.version && !state.hasUnsavedChanges) {
        broadcastSave();
      }
    },
    []
  );

  // 广播保存成功
  const broadcastSave = useCallback(() => {
    if (!channelRef.current || !projectId) return;

    const state = useCanvasStore.getState();
    const message: SyncMessage = {
      type: "CANVAS_SAVED",
      projectId,
      version: state.projectVersion,
      elements: state.elements,
      viewport: state.viewport,
      timestamp: Date.now(),
      tabId: TAB_ID,
    };

    channelRef.current.postMessage(message);
  }, [projectId]);

  // 请求同步
  const requestSync = useCallback(() => {
    if (!channelRef.current || !projectId) return;

    const message: SyncMessage = {
      type: "REQUEST_SYNC",
      projectId,
      version: projectVersion,
      timestamp: Date.now(),
      tabId: TAB_ID,
    };

    channelRef.current.postMessage(message);
  }, [projectId, projectVersion]);

  // 监听保存状态变化，成功时广播
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = useCanvasStore.subscribe(
      (state) => state.saveStatus,
      (status, prevStatus) => {
        if (prevStatus === "saving" && status === "saved") {
          broadcastSave();
        }
      }
    );

    return unsubscribe;
  }, [enabled, broadcastSave]);

  // 页面获得焦点时请求同步
  useEffect(() => {
    if (!enabled) return;

    const handleFocus = () => {
      // 延迟请求，避免频繁触发
      setTimeout(requestSync, 500);
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, requestSync]);

  return {
    broadcastSave,
    requestSync,
    tabId: TAB_ID,
  };
}

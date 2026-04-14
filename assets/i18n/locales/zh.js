export const zh = {
  page: { title: "Edge收藏夹编辑器" },
  brand: { title: "Edge收藏夹编辑器" },
  search: {
    placeholder: "搜索文件夹名、网站名、网址...",
    clear: "清空",
  },
  scope: {
    all: "全部收藏",
    subtree: "当前及子文件夹",
    current: "当前文件夹",
  },
  type: {
    all: "全部类型",
    folder: "仅文件夹",
    bookmark: "仅网址",
  },
  menu: {
    import: "导入 ▾",
    export: "导出 ▾",
    html: "HTML",
    json: "JSON",
    preloaded: "预置",
  },
  btn: {
    reset: "重置",
    fetchMissingIcons: "获取ICON",
    fetchMissingIconsTitle: "一键获取缺失ICON",
    langToggleTitle: "切换语言（当前：中文）",
    langToggleAria: "切换语言",
    themeToggleTitle: "切换主题",
    themeToggleAria: "切换主题",
    addFolder: "新建文件夹",
    addBookmark: "添加网址",
  },
  panel: {
    tree: "目录",
    content: "内容",
    editor: "编辑器",
  },
  tooltip: {
    app: {
      aria: "应用说明",
      title: "应用说明",
      items: [
        "可导入 Edge 导出的 HTML，或导入 JSON 备份。",
        "在三栏里修改名称、网址、图标，改完自动保存。",
        "编辑完成后导出 HTML，直接回 Edge 导入即可。",
      ],
    },
    tree: {
      aria: "目录区说明",
      title: "目录区",
      items: [
        "单击可选中项目，内容区和编辑区会同步切换。",
        "点左侧三角可展开或收起文件夹层级。",
        "文件夹后面的数字表示子项数量。",
      ],
    },
    content: {
      aria: "内容区说明",
      title: "内容区",
      items: [
        "显示当前文件夹内容，也会显示搜索/筛选结果。",
        "双击文件夹进入，单击卡片开始编辑。",
        "拖动项目可排序，也可拖进文件夹归类。",
      ],
    },
    editor: {
      aria: "编辑区说明",
      title: "编辑区",
      items: [
        "可修改名称、网址和图标。",
        "图标支持网络获取和本地上传。",
        "支持移动到其他文件夹，或删除当前项。",
      ],
    },
    name: {
      aria: "名称说明",
      title: "名称",
      items: [
        "这里是显示名称，会出现在目录区和内容区。",
        "留空时会自动使用默认名称。",
      ],
    },
    url: {
      aria: "网址说明",
      title: "网址",
      items: [
        "建议填写完整链接（如 https://example.com）。",
        "网络获取图标会基于这个地址尝试匹配。",
      ],
    },
    icon: {
      aria: "ICON说明",
      title: "ICON",
      items: [
        "支持图标链接，或 data:image...。",
        "也可以用“网络获取”或“本地上传”快速设置。",
      ],
    },
    actions: {
      aria: "操作说明",
      title: "操作",
      items: [
        "移动到文件夹：把当前项放到目标目录。",
        "删除：移除当前选中项（会二次确认）。",
      ],
    },
  },
  editor: {
    type: {
      none: "未选择",
      folder: "文件夹",
      bookmark: "网址",
    },
    empty: "从目录区或内容区选中一个文件夹 / 网址后，即可在这里编辑。",
    label: {
      name: "名称",
      url: "网址",
      icon: "ICON",
      actions: "操作",
    },
    iconPreviewAlt: "ICON预览",
    iconPlaceholder: "支持 data:image... / http(s)链接 / 原始Base64",
    btn: {
      fetchIcon: "网络获取",
      uploadIcon: "本地上传",
      move: "移动到文件夹",
      delete: "删除",
    },
  },
  moveModal: {
    title: "移动到文件夹",
    close: "关闭",
    helper: "请选择目标文件夹，然后点击底部确认移动。",
    cancel: "取消",
    confirm: "确认移动",
  },
  list: {
    titlePrefix: "内容：",
    empty: "这里还没有匹配内容。你可以新建文件夹、添加网址，或者切换筛选范围。",
    pathPrefix: "所在路径：",
    metaType: "类型：{type}",
    metaItemCount: "项目数：{count}",
    itemTypes: {
      folder: "文件夹",
      bookmark: "网址",
    },
    buttons: {
      enter: "进入",
      copyUrl: "复制网址",
      openUrl: "打开网址",
    },
    stats: {
      folder: "文件夹 {count}",
      bookmark: "网址 {count}",
    },
    treeStats: "网址 {count}",
  },
  alerts: {
    importFirst: "请先导入或载入收藏数据。",
    readImageFailed: "读取图片失败",
    selectBookmarkFirst: "请先选中一个网址。",
    cannotDeleteRoot: "根目录不能删除。",
    confirmDelete: "确定删除“{title}”吗？",
  },
  toasts: {
    fetchCurrentStart: "正在网络获取当前网址 ICON...",
    fetchCurrentSuccess: "当前网址 ICON 获取成功。",
    fetchCurrentFailed: "当前网址 ICON 获取失败。",
    noMissingIcons: "没有缺失 ICON 的网址。",
    batchProgress: "ICON抓取中 {done}/{total}（成功 {success}，失败 {failed}）",
    batchDone: "ICON抓取完成：成功 {success}，失败 {failed}",
  },
  defaults: {
    rootTitle: "全部收藏",
    untitledFolder: "未命名文件夹",
    untitledBookmark: "未命名网址",
    newFolder: "新建文件夹",
    newBookmark: "新建网址",
  },
};

export const en = {
  page: { title: "Edge Bookmark Editor" },
  brand: { title: "Edge Bookmark Editor" },
  search: {
    placeholder: "Search folder, site, URL...",
    clear: "Clear",
  },
  scope: {
    all: "All Bookmarks",
    subtree: "Current + Subfolders",
    current: "Current Folder",
  },
  type: {
    all: "All Types",
    folder: "Folders Only",
    bookmark: "Bookmarks Only",
  },
  menu: {
    import: "Import ▾",
    export: "Export ▾",
    html: "HTML",
    json: "JSON",
    preloaded: "Sample",
  },
  btn: {
    reset: "Reset",
    fetchMissingIcons: "Get Icons",
    fetchMissingIconsTitle: "Fetch icons for missing items",
    langToggleTitle: "Switch language (current: English)",
    langToggleAria: "Switch language",
    themeToggleTitle: "Toggle theme",
    themeToggleAria: "Toggle theme",
    addFolder: "New Folder",
    addBookmark: "Add Bookmark",
  },
  panel: {
    tree: "Tree",
    content: "Content",
    editor: "Editor",
  },
  tooltip: {
    app: {
      aria: "App help",
      title: "App",
      items: [
        "Import Edge bookmark HTML or a JSON backup.",
        "Edit names, links, and icons across the 3 panels with auto-save.",
        "Export HTML and import it back into Edge.",
      ],
    },
    tree: {
      aria: "Tree help",
      title: "Tree Panel",
      items: [
        "Click an item to sync selection with content and editor.",
        "Use the arrow to expand or collapse folders.",
        "Numbers after folders show child counts.",
      ],
    },
    content: {
      aria: "Content help",
      title: "Content Panel",
      items: [
        "Shows current folder items and search/filter results.",
        "Double-click folder to enter; click card to edit.",
        "Drag items to reorder or move into folders.",
      ],
    },
    editor: {
      aria: "Editor help",
      title: "Editor Panel",
      items: [
        "Edit name, URL, and icon.",
        "Icons support network fetch and local upload.",
        "Move to folder or delete the selected item.",
      ],
    },
    name: {
      aria: "Name help",
      title: "Name",
      items: [
        "This is the display name shown in tree and content.",
        "If empty, a default name is used automatically.",
      ],
    },
    url: {
      aria: "URL help",
      title: "URL",
      items: [
        "Use a full link like https://example.com.",
        "Icon fetch uses this URL to find a matching favicon.",
      ],
    },
    icon: {
      aria: "Icon help",
      title: "ICON",
      items: [
        "Supports icon URL or data:image...",
        "You can also use Network Fetch or Local Upload.",
      ],
    },
    actions: {
      aria: "Actions help",
      title: "Actions",
      items: [
        "Move to Folder: send current item to another folder.",
        "Delete: remove current selection (with confirmation).",
      ],
    },
  },
  editor: {
    type: {
      none: "None",
      folder: "Folder",
      bookmark: "Bookmark",
    },
    empty: "Select a folder or bookmark from Tree/Content to edit here.",
    label: {
      name: "Name",
      url: "URL",
      icon: "ICON",
      actions: "Actions",
    },
    iconPreviewAlt: "ICON preview",
    iconPlaceholder: "Supports data:image... / http(s) URL / raw Base64",
    btn: {
      fetchIcon: "Fetch Online",
      uploadIcon: "Upload Local",
      move: "Move to Folder",
      delete: "Delete",
    },
  },
  moveModal: {
    title: "Move to Folder",
    close: "Close",
    helper: "Select target folder, then click Confirm.",
    cancel: "Cancel",
    confirm: "Confirm Move",
  },
  list: {
    titlePrefix: "Content: ",
    empty: "No matching items here. Create a folder/bookmark or adjust filters.",
    pathPrefix: "Path: ",
    metaType: "Type: {type}",
    metaItemCount: "Items: {count}",
    itemTypes: {
      folder: "Folder",
      bookmark: "Bookmark",
    },
    buttons: {
      enter: "Enter",
      copyUrl: "Copy URL",
      openUrl: "Open URL",
    },
    stats: {
      folder: "Folders {count}",
      bookmark: "Bookmarks {count}",
    },
    treeStats: "Bookmarks {count}",
  },
  alerts: {
    importFirst: "Please import or load bookmark data first.",
    readImageFailed: "Failed to read image file.",
    selectBookmarkFirst: "Please select a bookmark first.",
    cannotDeleteRoot: "Root folder cannot be deleted.",
    confirmDelete: "Delete \"{title}\"?",
  },
  toasts: {
    fetchCurrentStart: "Fetching ICON for current bookmark...",
    fetchCurrentSuccess: "ICON fetched for current bookmark.",
    fetchCurrentFailed: "Failed to fetch ICON for current bookmark.",
    noMissingIcons: "No bookmarks missing ICON.",
    batchProgress: "Fetching ICON {done}/{total} (ok {success}, fail {failed})",
    batchDone: "ICON fetch complete: ok {success}, fail {failed}",
  },
  defaults: {
    rootTitle: "All Bookmarks",
    untitledFolder: "Untitled Folder",
    untitledBookmark: "Untitled Bookmark",
    newFolder: "New Folder",
    newBookmark: "New Bookmark",
  },
};

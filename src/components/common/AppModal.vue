<!DOCTYPE html>

<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>DataCorp Admin - Analytics Dashboard</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            "colors": {
                    "secondary": "#505f76",
                    "on-tertiary": "#ffffff",
                    "surface-tint": "#0053db",
                    "background": "#f7f9fb",
                    "tertiary-fixed": "#ffdbcd",
                    "outline": "#737686",
                    "primary-fixed": "#dbe1ff",
                    "inverse-surface": "#2d3133",
                    "inverse-primary": "#b4c5ff",
                    "error": "#ba1a1a",
                    "error-container": "#ffdad6",
                    "surface-container": "#eceef0",
                    "on-background": "#191c1e",
                    "surface-container-low": "#f2f4f6",
                    "primary-container": "#2563eb",
                    "on-primary-fixed": "#00174b",
                    "tertiary-fixed-dim": "#ffb596",
                    "on-error": "#ffffff",
                    "on-primary": "#ffffff",
                    "tertiary-container": "#bc4800",
                    "inverse-on-surface": "#eff1f3",
                    "on-tertiary-container": "#ffede6",
                    "on-secondary": "#ffffff",
                    "on-error-container": "#93000a",
                    "secondary-fixed": "#d3e4fe",
                    "surface-container-high": "#e6e8ea",
                    "on-secondary-container": "#54647a",
                    "surface-container-lowest": "#ffffff",
                    "surface-dim": "#d8dadc",
                    "outline-variant": "#c3c6d7",
                    "on-surface": "#191c1e",
                    "surface-variant": "#e0e3e5",
                    "on-primary-container": "#eeefff",
                    "surface-container-highest": "#e0e3e5",
                    "on-secondary-fixed": "#0b1c30",
                    "primary": "#004ac6",
                    "surface-bright": "#f7f9fb",
                    "on-surface-variant": "#434655",
                    "surface": "#f7f9fb",
                    "tertiary": "#943700",
                    "primary-fixed-dim": "#b4c5ff",
                    "secondary-container": "#d0e1fb",
                    "on-primary-fixed-variant": "#003ea8",
                    "on-secondary-fixed-variant": "#38485d",
                    "on-tertiary-fixed": "#360f00",
                    "on-tertiary-fixed-variant": "#7d2d00",
                    "secondary-fixed-dim": "#b7c8e1"
            },
            "borderRadius": {
                    "DEFAULT": "0.125rem",
                    "lg": "0.25rem",
                    "xl": "0.5rem",
                    "full": "0.75rem"
            },
            "spacing": {
                    "stack-gap-md": "1rem",
                    "table-cell-padding-x": "1rem",
                    "container-margin": "2rem",
                    "stack-gap-sm": "0.5rem",
                    "stack-gap-lg": "1.5rem",
                    "table-cell-padding-y": "0.75rem"
            },
            "fontFamily": {
                    "body-md": ["Inter"],
                    "display-sm": ["Inter"],
                    "table-header": ["Inter"],
                    "body-sm": ["Inter"],
                    "data-mono": ["JetBrains Mono"],
                    "label-caps": ["Inter"]
            },
            "fontSize": {
                    "body-md": ["14px", {"lineHeight": "20px", "fontWeight": "400"}],
                    "display-sm": ["24px", {"lineHeight": "32px", "letterSpacing": "-0.02em", "fontWeight": "600"}],
                    "table-header": ["12px", {"lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600"}],
                    "body-sm": ["13px", {"lineHeight": "18px", "fontWeight": "400"}],
                    "data-mono": ["13px", {"lineHeight": "18px", "fontWeight": "400"}],
                    "label-caps": ["11px", {"lineHeight": "12px", "letterSpacing": "0.02em", "fontWeight": "700"}]
            }
          },
        },
      }
    </script>
<style>
        body { font-family: 'Inter', sans-serif; background-color: #f7f9fb; }
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
            display: inline-block;
            vertical-align: middle;
            line-height: 1;
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e0e3e5; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #c3c6d7; }
        
        /* Custom Table Elevation and interactivity */
        .data-table-container {
            box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03);
        }
        .zebra-row:nth-child(even) {
            background-color: #fbfcfd;
        }
    </style>
</head>
<body class="bg-background text-on-background overflow-hidden h-screen flex">
<!-- Predicted SideNavBar -->
<aside class="h-screen w-64 fixed left-0 top-0 flex flex-col py-6 bg-surface-container-lowest border-r border-outline-variant z-50">
<div class="px-6 mb-10">
<h1 class="font-display-sm text-display-sm font-bold text-primary">DataCorp Admin</h1>
<p class="font-body-md text-on-surface-variant opacity-70">Enterprise Suite</p>
</div>
<nav class="flex-1 px-4 space-y-1">
<a class="flex items-center gap-3 px-3 py-2 text-primary font-bold border-r-2 border-primary transition-colors duration-200" href="#">
<span class="material-symbols-outlined" data-icon="dashboard">dashboard</span>
<span class="font-body-md text-body-md">Dashboard</span>
</a>
<a class="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200" href="#">
<span class="material-symbols-outlined" data-icon="analytics">analytics</span>
<span class="font-body-md text-body-md">Analytics</span>
</a>
<a class="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200" href="#">
<span class="material-symbols-outlined" data-icon="inventory_2">inventory_2</span>
<span class="font-body-md text-body-md">Inventory</span>
</a>
<a class="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200" href="#">
<span class="material-symbols-outlined" data-icon="assessment">assessment</span>
<span class="font-body-md text-body-md">Reports</span>
</a>
<a class="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200" href="#">
<span class="material-symbols-outlined" data-icon="settings">settings</span>
<span class="font-body-md text-body-md">Settings</span>
</a>
<a class="flex items-center gap-3 px-3 py-2 text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200" href="#">
<span class="material-symbols-outlined" data-icon="help">help</span>
<span class="font-body-md text-body-md">Help</span>
</a>
</nav>
<div class="px-4 mt-auto">
<div class="flex items-center gap-3 p-3 bg-surface-container rounded-lg">
<img class="w-10 h-10 rounded-full object-cover" data-alt="A professional workspace avatar, minimalist profile photo of a user in a modern office setting with soft directional lighting, representing high-end corporate identity with a clean neutral background." src="https://lh3.googleusercontent.com/aida-public/AB6AXuAr3uR2Yjyd6Jo-0X592SfTS4BMf0xqLzpcgvbSWKmtvC0rW6OMjQFbX7JsQ_p6cl2VkCH3rXUe-eRGRVoF9ICFlJ5TIWSJMpGwqx16ffdxNKCpfr4qWhYo9AizM7c1CXcW1nNcPBbMfZhgtk62V2nh2dGrYg1zmA1keq4nfPhtPUjnEDlBqqpOorIJzscS4B2FVEyThdB3kHBDV03Tmznmmb6iYWQtXmIizAs2msq323uHrcrArF8jyA"/>
<div class="overflow-hidden">
<p class="font-body-md text-body-md font-bold truncate">Alex Rivera</p>
<p class="text-xs text-on-surface-variant truncate">Workspace Admin</p>
</div>
</div>
</div>
</aside>
<div class="flex-1 flex flex-col ml-64 min-w-0">
<!-- Predicted TopNavBar -->
<header class="flex justify-between items-center h-16 px-8 sticky top-0 z-40 bg-surface border-b border-outline-variant">
<div class="flex items-center gap-4 flex-1">
<div class="relative w-full max-w-md">
<span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" data-icon="search">search</span>
<input class="w-full h-10 pl-10 pr-4 bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="Search data points..." type="text"/>
</div>
</div>
<div class="flex items-center gap-6">
<div class="flex items-center gap-1">
<button class="p-2 text-on-surface-variant hover:text-primary transition-all duration-200">
<span class="material-symbols-outlined" data-icon="notifications">notifications</span>
</button>
<button class="p-2 text-on-surface-variant hover:text-primary transition-all duration-200">
<span class="material-symbols-outlined" data-icon="history">history</span>
</button>
</div>
<div class="h-8 w-[1px] bg-outline-variant"></div>
<h2 class="font-display-sm text-display-sm font-bold text-on-surface">Analytics Dashboard</h2>
</div>
</header>
<!-- Main Content Area -->
<main class="flex-1 overflow-auto p-8 bg-background">
<!-- Header Section with Filters -->
<div class="flex justify-between items-end mb-8">
<div>
<h3 class="font-display-sm text-display-sm font-bold text-on-surface mb-1">Global Assets</h3>
<p class="font-body-md text-on-surface-variant">Real-time status tracking and asset management for Enterprise Suite.</p>
</div>
<div class="flex gap-2">
<button class="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-lg font-body-md text-body-md hover:bg-surface-container-low transition-colors">
<span class="material-symbols-outlined text-sm" data-icon="filter_list">filter_list</span>
                        Filter
                    </button>
<button class="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-lg font-body-md text-body-md hover:bg-surface-container-low transition-colors">
<span class="material-symbols-outlined text-sm" data-icon="download">download</span>
                        Export
                    </button>
<button class="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-body-md text-body-md font-bold shadow-sm hover:opacity-90 transition-opacity">
<span class="material-symbols-outlined text-sm" data-icon="add">add</span>
                        New Entry
                    </button>
</div>
</div>
<!-- Bento Stats Summary (Mini) -->
<div class="grid grid-cols-4 gap-6 mb-8">
<div class="p-5 bg-white border border-outline-variant rounded-xl">
<p class="font-label-caps text-label-caps text-on-surface-variant mb-2">TOTAL ENTITIES</p>
<div class="flex items-end justify-between">
<p class="font-data-mono text-2xl font-bold">12,408</p>
<span class="text-xs text-green-600 bg-green-50 px-2 py-1 rounded font-bold">+2.4%</span>
</div>
</div>
<div class="p-5 bg-white border border-outline-variant rounded-xl">
<p class="font-label-caps text-label-caps text-on-surface-variant mb-2">ACTIVE NODES</p>
<div class="flex items-end justify-between">
<p class="font-data-mono text-2xl font-bold">8,912</p>
<span class="text-xs text-green-600 bg-green-50 px-2 py-1 rounded font-bold">+1.8%</span>
</div>
</div>
<div class="p-5 bg-white border border-outline-variant rounded-xl">
<p class="font-label-caps text-label-caps text-on-surface-variant mb-2">ALERT RATE</p>
<div class="flex items-end justify-between">
<p class="font-data-mono text-2xl font-bold">0.04%</p>
<span class="text-xs text-red-600 bg-red-50 px-2 py-1 rounded font-bold">-0.1%</span>
</div>
</div>
<div class="p-5 bg-white border border-outline-variant rounded-xl">
<p class="font-label-caps text-label-caps text-on-surface-variant mb-2">PENDING SYNC</p>
<div class="flex items-end justify-between">
<p class="font-data-mono text-2xl font-bold">24</p>
<span class="text-xs text-secondary-container text-on-secondary-container px-2 py-1 rounded font-bold">STABLE</span>
</div>
</div>
</div>
<!-- Main Data Table Container -->
<div class="bg-white border border-outline-variant rounded-xl data-table-container overflow-hidden flex flex-col">
<div class="overflow-x-auto">
<table class="w-full text-left border-collapse">
<thead>
<tr class="bg-surface-container-low border-b border-outline-variant">
<th class="px-6 py-4 font-table-header text-table-header text-on-surface-variant uppercase tracking-wider">
<div class="flex items-center gap-2">
<input class="rounded-sm border-outline-variant text-primary focus:ring-primary h-4 w-4" type="checkbox"/>
                                        Name
                                    </div>
</th>
<th class="px-6 py-4 font-table-header text-table-header text-on-surface-variant uppercase tracking-wider">Status</th>
<th class="px-6 py-4 font-table-header text-table-header text-on-surface-variant uppercase tracking-wider">Category</th>
<th class="px-6 py-4 font-table-header text-table-header text-on-surface-variant uppercase tracking-wider">Date</th>
<th class="px-6 py-4 font-table-header text-table-header text-on-surface-variant uppercase tracking-wider text-right">Value (USD)</th>
<th class="px-6 py-4 font-table-header text-table-header text-on-surface-variant uppercase tracking-wider text-center">Actions</th>
</tr>
</thead>
<tbody class="divide-y divide-outline-variant">
<!-- Table Rows -->
<tr class="zebra-row hover:bg-surface-container-low transition-colors duration-150">
<td class="px-6 py-4">
<div class="flex items-center gap-3">
<input class="rounded-sm border-outline-variant text-primary focus:ring-primary h-4 w-4" type="checkbox"/>
<div>
<p class="font-body-md text-body-md font-bold">Project Aether</p>
<p class="text-xs text-on-surface-variant">ID: #AE-9981</p>
</div>
</div>
</td>
<td class="px-6 py-4">
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Active</span>
</td>
<td class="px-6 py-4 font-body-md text-body-md text-on-surface-variant">Cloud Infrastructure</td>
<td class="px-6 py-4 font-data-mono text-body-sm">Oct 12, 2023</td>
<td class="px-6 py-4 font-data-mono text-body-md text-right">12,500.00</td>
<td class="px-6 py-4 text-center">
<button class="text-on-surface-variant hover:text-primary p-1 rounded hover:bg-surface-variant transition-all">
<span class="material-symbols-outlined" data-icon="more_vert">more_vert</span>
</button>
</td>
</tr>
<tr class="zebra-row hover:bg-surface-container-low transition-colors duration-150">
<td class="px-6 py-4">
<div class="flex items-center gap-3">
<input class="rounded-sm border-outline-variant text-primary focus:ring-primary h-4 w-4" type="checkbox"/>
<div>
<p class="font-body-md text-body-md font-bold">Helios Terminal</p>
<p class="text-xs text-on-surface-variant">ID: #HT-4421</p>
</div>
</div>
</td>
<td class="px-6 py-4">
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">Pending</span>
</td>
<td class="px-6 py-4 font-body-md text-body-md text-on-surface-variant">Research Data</td>
<td class="px-6 py-4 font-data-mono text-body-sm">Oct 14, 2023</td>
<td class="px-6 py-4 font-data-mono text-body-md text-right">4,210.50</td>
<td class="px-6 py-4 text-center">
<button class="text-on-surface-variant hover:text-primary p-1 rounded hover:bg-surface-variant transition-all">
<span class="material-symbols-outlined" data-icon="more_vert">more_vert</span>
</button>
</td>
</tr>
<tr class="zebra-row hover:bg-surface-container-low transition-colors duration-150">
<td class="px-6 py-4">
<div class="flex items-center gap-3">
<input class="rounded-sm border-outline-variant text-primary focus:ring-primary h-4 w-4" type="checkbox"/>
<div>
<p class="font-body-md text-body-md font-bold">Quantum Core</p>
<p class="text-xs text-on-surface-variant">ID: #QC-1120</p>
</div>
</div>
</td>
<td class="px-6 py-4">
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Active</span>
</td>
<td class="px-6 py-4 font-body-md text-body-md text-on-surface-variant">Neural Systems</td>
<td class="px-6 py-4 font-data-mono text-body-sm">Oct 15, 2023</td>
<td class="px-6 py-4 font-data-mono text-body-md text-right">89,000.00</td>
<td class="px-6 py-4 text-center">
<button class="text-on-surface-variant hover:text-primary p-1 rounded hover:bg-surface-variant transition-all">
<span class="material-symbols-outlined" data-icon="more_vert">more_vert</span>
</button>
</td>
</tr>
<tr class="zebra-row hover:bg-surface-container-low transition-colors duration-150">
<td class="px-6 py-4">
<div class="flex items-center gap-3">
<input class="rounded-sm border-outline-variant text-primary focus:ring-primary h-4 w-4" type="checkbox"/>
<div>
<p class="font-body-md text-body-md font-bold">Shadow Archive</p>
<p class="text-xs text-on-surface-variant">ID: #SA-7762</p>
</div>
</div>
</td>
<td class="px-6 py-4">
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">Critical</span>
</td>
<td class="px-6 py-4 font-body-md text-body-md text-on-surface-variant">Security Storage</td>
<td class="px-6 py-4 font-data-mono text-body-sm">Oct 16, 2023</td>
<td class="px-6 py-4 font-data-mono text-body-md text-right">2,100.99</td>
<td class="px-6 py-4 text-center">
<button class="text-on-surface-variant hover:text-primary p-1 rounded hover:bg-surface-variant transition-all">
<span class="material-symbols-outlined" data-icon="more_vert">more_vert</span>
</button>
</td>
</tr>
<tr class="zebra-row hover:bg-surface-container-low transition-colors duration-150">
<td class="px-6 py-4">
<div class="flex items-center gap-3">
<input class="rounded-sm border-outline-variant text-primary focus:ring-primary h-4 w-4" type="checkbox"/>
<div>
<p class="font-body-md text-body-md font-bold">Omni Pipeline</p>
<p class="text-xs text-on-surface-variant">ID: #OP-8820</p>
</div>
</div>
</td>
<td class="px-6 py-4">
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">Archived</span>
</td>
<td class="px-6 py-4 font-body-md text-body-md text-on-surface-variant">DevOps Tools</td>
<td class="px-6 py-4 font-data-mono text-body-sm">Oct 18, 2023</td>
<td class="px-6 py-4 font-data-mono text-body-md text-right">540.00</td>
<td class="px-6 py-4 text-center">
<button class="text-on-surface-variant hover:text-primary p-1 rounded hover:bg-surface-variant transition-all">
<span class="material-symbols-outlined" data-icon="more_vert">more_vert</span>
</button>
</td>
</tr>
<tr class="zebra-row hover:bg-surface-container-low transition-colors duration-150">
<td class="px-6 py-4">
<div class="flex items-center gap-3">
<input class="rounded-sm border-outline-variant text-primary focus:ring-primary h-4 w-4" type="checkbox"/>
<div>
<p class="font-body-md text-body-md font-bold">Vortex Gateway</p>
<p class="text-xs text-on-surface-variant">ID: #VG-0012</p>
</div>
</div>
</td>
<td class="px-6 py-4">
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Active</span>
</td>
<td class="px-6 py-4 font-body-md text-body-md text-on-surface-variant">Edge Computing</td>
<td class="px-6 py-4 font-data-mono text-body-sm">Oct 20, 2023</td>
<td class="px-6 py-4 font-data-mono text-body-md text-right">31,250.00</td>
<td class="px-6 py-4 text-center">
<button class="text-on-surface-variant hover:text-primary p-1 rounded hover:bg-surface-variant transition-all">
<span class="material-symbols-outlined" data-icon="more_vert">more_vert</span>
</button>
</td>
</tr>
</tbody>
</table>
</div>
<!-- Pagination Footer -->
<div class="px-6 py-4 bg-surface-container-lowest border-t border-outline-variant flex items-center justify-between">
<div class="flex items-center gap-4">
<p class="font-body-sm text-body-sm text-on-surface-variant">Rows per page:</p>
<select class="bg-transparent border-none font-body-sm text-body-sm focus:ring-0 cursor-pointer">
<option>10</option>
<option>25</option>
<option>50</option>
</select>
</div>
<div class="flex items-center gap-8">
<p class="font-body-sm text-body-sm text-on-surface-variant">1-10 of 1,240</p>
<div class="flex gap-1">
<button class="p-1 rounded hover:bg-surface-variant text-on-surface-variant transition-colors disabled:opacity-30" disabled="">
<span class="material-symbols-outlined" data-icon="first_page">first_page</span>
</button>
<button class="p-1 rounded hover:bg-surface-variant text-on-surface-variant transition-colors disabled:opacity-30" disabled="">
<span class="material-symbols-outlined" data-icon="chevron_left">chevron_left</span>
</button>
<button class="p-1 rounded hover:bg-surface-variant text-on-surface-variant transition-colors">
<span class="material-symbols-outlined" data-icon="chevron_right">chevron_right</span>
</button>
<button class="p-1 rounded hover:bg-surface-variant text-on-surface-variant transition-colors">
<span class="material-symbols-outlined" data-icon="last_page">last_page</span>
</button>
</div>
</div>
</div>
</div>
<!-- Additional Context - Footer Decorative Element -->
<div class="mt-8 grid grid-cols-2 gap-6">
<div class="p-6 bg-secondary-container text-on-secondary-container rounded-xl flex items-center gap-6 overflow-hidden relative">
<div class="relative z-10 flex-1">
<h4 class="font-display-sm text-lg font-bold mb-2">Automated Insights</h4>
<p class="font-body-md mb-4 opacity-90">Our AI model detected 3 anomalies in the research data category. We recommend a manual audit of the 'Helios Terminal' asset.</p>
<button class="px-4 py-2 bg-on-secondary-container text-secondary-container font-bold rounded-lg hover:opacity-90 transition-opacity">Review Now</button>
</div>
<div class="w-32 h-32 flex-shrink-0 relative z-10">
<span class="material-symbols-outlined text-[120px] opacity-10 absolute -bottom-4 -right-4" data-icon="psychology">psychology</span>
</div>
</div>
<div class="p-6 bg-white border border-outline-variant rounded-xl flex flex-col justify-center">
<div class="flex items-center gap-4 mb-4">
<div class="w-12 h-12 bg-primary-container text-on-primary-container rounded-full flex items-center justify-center">
<span class="material-symbols-outlined" data-icon="cloud_sync">cloud_sync</span>
</div>
<div>
<h4 class="font-body-md font-bold">System Status: Optimal</h4>
<p class="text-xs text-on-surface-variant">Last sync completed 2 minutes ago</p>
</div>
</div>
<div class="w-full bg-surface-container rounded-full h-2 overflow-hidden">
<div class="bg-primary h-full w-[94%]" style="transition: width 1s ease-in-out;"></div>
</div>
<div class="flex justify-between mt-2">
<span class="text-[10px] uppercase font-bold text-on-surface-variant">Sync Progress</span>
<span class="text-[10px] uppercase font-bold text-primary">94%</span>
</div>
</div>
</div>
</main>
</div>
<script>
        // Micro-interaction for table rows
        document.querySelectorAll('.zebra-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox' && !e.target.closest('button')) {
                    const checkbox = row.querySelector('input[type="checkbox"]');
                    checkbox.checked = !checkbox.checked;
                    if(checkbox.checked) {
                        row.classList.add('bg-primary-fixed/20');
                    } else {
                        row.classList.remove('bg-primary-fixed/20');
                    }
                }
            });
            
            // Handle checkbox change state directly
            const checkbox = row.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', () => {
                if(checkbox.checked) {
                    row.classList.add('bg-primary-fixed/20');
                } else {
                    row.classList.remove('bg-primary-fixed/20');
                }
            });
        });

        // Search bar interaction
        const searchInput = document.querySelector('input[type="text"]');
        searchInput.addEventListener('focus', () => {
            searchInput.parentElement.classList.add('ring-2', 'ring-primary');
        });
        searchInput.addEventListener('blur', () => {
            searchInput.parentElement.classList.remove('ring-2', 'ring-primary');
        });
    </script>
</body></html>
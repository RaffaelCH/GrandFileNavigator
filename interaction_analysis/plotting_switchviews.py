import matplotlib
import matplotlib.pyplot as plt
from helpers import remove_micronavigations

step_size = 100  # plot step size in ms

relevant_interaction_types = ["Scroll", "ChangeVisibleRanges", "ChangeFile", "EditFile",
                              "EditingSession", "NavigationJump", "SidebarVisible"]
color_map = matplotlib.colormaps['tab10']  # Use a standard colormap

color_types = set(relevant_interaction_types)
color_types.remove("SidebarVisible")
color_types.update(["SidebarVisible-histogram", "SidebarVisible-hotspots"])
type_to_color = {itype: color_map(i / len(color_types))
                 for i, itype in enumerate(sorted(color_types))}


# TODO: Convert sidebar visibility to duration to use them as indicators.
def preprocess_interactions(interactions):
    # Remove minor/unimportant entries.
    interactions = [i for i in interactions if i['interactionType']
                    != "EditFile" and i['interactionType'] != "UnknownJump"]
    interactions = remove_micronavigations(interactions, 6)

    # Start at time 0.
    interactions_start = interactions[0]["timeStamp"]
    for interaction in interactions:
        interaction["timeStamp"] = interaction["timeStamp"] - \
            interactions_start
        if "startTime" in interaction:
            interaction["startTime"] = interaction["startTime"] - \
                interactions_start
        if "endTime" in interaction:
            interaction["endTime"] = interaction["endTime"] - \
                interactions_start

    return interactions


# Toggling sidebar results in singular interactions -> convert them to time ranges where sidebar is visible
def convert_sidebar_toggles_to_range(interactions):
    sidebar_visibility_indicators = []
    switch_view_interactions = [
        interaction for interaction in interactions if interaction['interactionType'] == "SwitchView"]
    sidebar_interactions = [interaction for interaction in interactions if interaction['interactionType']
                            == "ChangeSidebarVisibility" or interaction['interactionType'] == "SwitchView"]

    sidebar_visible = True  # sidebar is initially visible
    visible_start = interactions[0]["timeStamp"]
    is_histogram = not switch_view_interactions or switch_view_interactions[
        0]["targetView"] == "hotspots"

    for sidebar_interaction in sidebar_interactions:
        if sidebar_interaction["interactionType"] == "SwitchView":
            view_type = "histogram" if is_histogram else "hotspots"
            sidebar_visibility_indicators.append(
                {"interactionType": "SidebarVisible", "startTime": visible_start, "endTime": sidebar_interaction["timeStamp"], "viewType": view_type})
            is_histogram = sidebar_interaction["targetView"] == "histogram"
            visible_start = sidebar_interaction["timeStamp"]
        else:
            if not sidebar_interaction["isVisible"]:
                view_type = "histogram" if is_histogram else "hotspots"
                sidebar_visibility_indicators.append(
                    {"interactionType": "SidebarVisible", "startTime": visible_start, "endTime": sidebar_interaction["timeStamp"], "viewType": view_type})
                sidebar_visible = False
            else:
                sidebar_visible = True
                visible_start = sidebar_interaction["timeStamp"]

    # Sidebar was visible at the end.
    if sidebar_visible:
        view_type = "histogram" if is_histogram else "hotspots"
        sidebar_visibility_indicators.append(
            {"interactionType": "SidebarVisible", "startTime": visible_start, "endTime": interactions[-1]["timeStamp"], "viewType": view_type})

    filtered_interactions = list(filter(
        lambda interaction: interaction["interactionType"] != "ChangeSidebarVisibility" and interaction["interactionType"] != "SwitchView", interactions))
    return filtered_interactions + sidebar_visibility_indicators


def convert_interactions(interactions):
    # Separate interactions
    point_interactions = []
    duration_interactions = []

    for item in interactions:
        if 'startTime' in item and 'endTime' in item:
            duration_interactions.append({
                'type': item['interactionType'],
                'start': item['startTime'],
                'end': item['endTime']
            })
            if 'viewType' in item:
                duration_interactions[-1]['viewType'] = item['viewType']
        elif 'timeStamp' in item:
            point_interactions.append({
                'type': item['interactionType'],
                'time': item['timeStamp'] / step_size
            })

    return point_interactions, duration_interactions


def plot_interactions(interactions):
    interactions = preprocess_interactions(interactions)
    sidebar_range_interactions = convert_sidebar_toggles_to_range(interactions)
    point_interactions, duration_interactions = convert_interactions(
        sidebar_range_interactions)

    # Create plot
    _, ax = plt.subplots(figsize=(15, 5))

    # Plot point interactions
    for i_type in relevant_interaction_types:
        times = [p['time'] for p in point_interactions if p['type'] == i_type]
        if not times:
            continue
        ax.scatter(
            times,
            [i_type] * len(times),
            label=f'{i_type}' if times else "",
            marker='o',
            s=40,
            color=type_to_color[i_type]
        )

    # Plot duration interactions
    for i_type in relevant_interaction_types:
        relevant = [d for d in duration_interactions if d['type'] == i_type]
        if not relevant:
            continue
        for i, d in enumerate(relevant):
            start, end = d['start'], d['end']
            if end - start < step_size:
                if (start + end) > step_size:
                    end += step_size
                else:
                    start -= step_size
            color_type = i_type if i_type != "SidebarVisible" else "SidebarVisible-" + \
                d["viewType"]
            ax.plot(
                [start / step_size, end / step_size],
                [color_type, color_type],
                linewidth=6,
                color=type_to_color[color_type],
                label=f'{color_type}' if i == 0 else ""
            )

    # Formatting
    ax.set_xlabel("Time (0.1s)")
    ax.set_ylabel("Interaction Type")
    ax.legend(
        title="Interaction Type",
        bbox_to_anchor=(1.02, 1),
        loc='upper left',
        borderaxespad=0
    )
    plt.title("Temporal Distribution of Interactions")
    plt.tight_layout()
    plt.show()

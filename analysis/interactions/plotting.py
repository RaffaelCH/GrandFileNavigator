import copy
import matplotlib
import matplotlib.pyplot as plt
from .helpers import remove_micronavigations

step_size = 100  # plot step size in ms

relevant_interaction_types = ["Scroll", "ChangeVisibleRanges", "ChangeFile",
                              "EditFile", "EditingSession", "NavigationJump", "SidebarVisible"]
color_map = matplotlib.colormaps['tab10']  # Use a standard colormap
type_to_color = {itype: color_map(i / len(relevant_interaction_types))
                 for i, itype in enumerate(sorted(relevant_interaction_types))}


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
def convert_sidebar_toggles_to_range(interactions, evaluation_active):
    filtered_interactions = list(filter(
        lambda interaction: interaction["interactionType"] != "ChangeSidebarVisibility", interactions))

    if not evaluation_active:
        return filtered_interactions

    sidebar_visibility_indicators = []
    sidebar_toggles = [
        interaction for interaction in interactions if interaction['interactionType'] == "ChangeSidebarVisibility"]

    sidebar_visible = True  # sidebar is initially visible
    visible_start = interactions[0]["timeStamp"]
    for sidebar_toggle in sidebar_toggles:
        if not sidebar_toggle["isVisible"]:
            sidebar_visibility_indicators.append(
                {"interactionType": "SidebarVisible", "startTime": visible_start, "endTime": sidebar_toggle["timeStamp"]})
            sidebar_visible = False
        else:
            sidebar_visible = True
            visible_start = sidebar_toggle["timeStamp"]

    # Sidebar was visible at the end.
    if sidebar_visible:
        sidebar_visibility_indicators.append(
            {"interactionType": "SidebarVisible", "startTime": visible_start, "endTime": interactions[-1]["timeStamp"]})

    filtered_interactions = list(filter(
        lambda interaction: interaction["interactionType"] != "ChangeSidebarVisibility", interactions))
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
        elif 'timeStamp' in item:
            point_interactions.append({
                'type': item['interactionType'],
                'time': item['timeStamp'] / step_size
            })

    return point_interactions, duration_interactions


def plot_interactions(interactions, extension_active):
    interactions = copy.deepcopy(interactions)
    interactions = preprocess_interactions(interactions)
    sidebar_range_interactions = convert_sidebar_toggles_to_range(
        interactions, extension_active)
    point_interactions, duration_interactions = convert_interactions(
        sidebar_range_interactions)

    # Create plot
    _, ax = plt.subplots(figsize=(15, 5))

    # Plot point interactions
    for i_type in relevant_interaction_types:
        times = [p['time'] for p in point_interactions if p['type'] == i_type]
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
        for i, d in enumerate(relevant):
            start, end = d['start'], d['end']
            if end - start < step_size:
                if (start + end) > step_size:
                    end += step_size
                else:
                    start -= step_size
            ax.plot(
                [start / step_size, end / step_size],
                [i_type, i_type],
                linewidth=6,
                color=type_to_color[i_type],
                label=f'{i_type}' if i == 0 else ""
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

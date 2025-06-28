# Cleanup

import json
import glob
import os
import copy


def remove_erroneous(interactionData):
    fixedInteractionData = []

    for interaction in interactionData:
        if interaction["interactionType"] == "ChangeFile":
            if not interaction["targetFilePath"] or interaction["sourceFilePath"] == interaction["targetFilePath"]:
                continue
        fixedInteractionData.append(interaction)

    return fixedInteractionData


def remove_duplicates(interactionData):
    cleanedInteractionData = []

    i = 0
    while i < len(interactionData):
        if i == len(interactionData) - 1 or interactionData[i] != interactionData[i+1]:
            cleanedInteractionData.append(interactionData[i])
        i += 1

    return cleanedInteractionData


# Processing


# Merge scrolls together.
# A scroll is all changes of the visible ranges with less than 250 between them (i.e., covers short interruptions).

def detect_scrolling(interactionData):
    # max time in ms between ChangeVisibleRanges entries to still be considered part of one scroll
    maxTimeBetweenChanges = 250
    scrollingInteractionData = []

    changeRangesInteraction = None
    for interaction in interactionData:
        if interaction["interactionType"] != "ChangeVisibleRanges":
            if changeRangesInteraction is not None:
                scrollingInteractionData.append(changeRangesInteraction)
                changeRangesInteraction = None
            scrollingInteractionData.append(interaction)
            continue

        if changeRangesInteraction is None:
            changeRangesInteraction = copy.deepcopy(interaction)
            continue

        isScrollInteraction = changeRangesInteraction["interactionType"] == "Scroll"
        lastInteractionEndTime = changeRangesInteraction[
            "endTime"] if isScrollInteraction else changeRangesInteraction["timeStamp"]
        if interaction["timeStamp"] - lastInteractionEndTime > maxTimeBetweenChanges:
            scrollingInteractionData.append(changeRangesInteraction)
            changeRangesInteraction = None
        else:
            # wasn't treated as scroll yet
            if changeRangesInteraction["interactionType"] == "ChangeVisibleRanges":
                changeRangesInteraction["interactionType"] = "Scroll"
                changeRangesInteraction["startTime"] = changeRangesInteraction["timeStamp"]
            changeRangesInteraction["endTime"] = interaction["timeStamp"]
            changeRangesInteraction["targetRange"] = interaction["targetRange"]

    if changeRangesInteraction is not None:
        scrollingInteractionData.append(changeRangesInteraction)

    return scrollingInteractionData


# Each edit is tracked separately. An uninterrupted writing session is combined into one entry.
def combine_edits(interactionData):
    # max time in ms between ChangeVisibleRanges entries to still be considered part of one edit session
    maxTimeBetweenChanges = 2000
    editingInteractionData = []

    editInteraction = None
    for interaction in interactionData:
        if interaction["interactionType"] != "EditFile":
            if editInteraction is not None:
                editingInteractionData.append(editInteraction)
                editInteraction = None
            editingInteractionData.append(interaction)
            continue

        if editInteraction is None:
            editInteraction = copy.deepcopy(interaction)
            continue

        isEditingSession = editInteraction["interactionType"] == "EditingSession"
        lastInteractionEndTime = editInteraction["endTime"] if isEditingSession else editInteraction["timeStamp"]
        if interaction["timeStamp"] - lastInteractionEndTime > maxTimeBetweenChanges:
            editingInteractionData.append(editInteraction)
            editInteraction = None
        else:
            # wasn't treated as session yet
            if editInteraction["interactionType"] == "EditFile":
                editInteraction["interactionType"] = "EditingSession"
                editInteraction["startTime"] = editInteraction["timeStamp"]
            editInteraction["endTime"] = interaction["timeStamp"]

    if editInteraction is not None:
        editingInteractionData.append(editInteraction)

    return editingInteractionData


# Data Loading


def get_newest_file(directory, startsWith="interactions_"):
    # Get list of all files in the directory
    files = glob.glob(os.path.join(directory, '*'))
    files = [file.replace("\\", "/") for file in files]

    # Check if the directory is empty
    if not files:
        return None

    # Filter for interaction data.
    if startsWith:
        files = [file for file in files if file.split(
            "/")[-1].startswith(startsWith)]

    # Get the newest file based on modification time
    newest_file = max(files, key=os.path.getmtime)
    return newest_file


def loadInteractionData(filepath):

    if not filepath:
        userprofile = os.path.expanduser("~").replace("\\", "/")
        fileDir = userprofile + '/AppData/Roaming/Code/User/workspaceStorage/d7a43fe73afccc995dbf874aaf3cc4ab/grandFileNavigator.grandfilenavigator'
        filePath = get_newest_file(fileDir)

    interactionData = []
    with open(filePath) as interactionDataFile:
        for interaction in interactionDataFile.readlines():
            interactionData.append(json.loads(interaction))

    return interactionData

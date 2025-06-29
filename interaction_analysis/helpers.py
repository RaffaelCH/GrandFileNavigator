# Cleanup

from collections import defaultdict
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
        if interaction["interactionType"] == "ChangeVisibleRanges" and interaction["targetRange"] == "undefined-undefined":
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


def parseRanges(interaction):
    """Returns [(sourceRangeStart, sourceRangeEnd), (targetRangeStart, targetRangeEnd)]"""
    interactionSourceStart = int(interaction["sourceRange"].split("-")[0])
    interactionSourceEnd = int(interaction["sourceRange"].split("-")[1])
    interactionTargetStart = int(interaction["targetRange"].split("-")[0])
    interactionTargetEnd = int(interaction["targetRange"].split("-")[1])
    return [(interactionSourceStart, interactionSourceEnd), (interactionTargetStart, interactionTargetEnd)]


def rangeChangeDirection(interaction):
    """Returns 1 if the interaction resulted in a move down, 0 is no change, and -1 otherwise."""
    ranges = parseRanges(interaction)
    if ranges[0][0] < ranges[1][0] or ranges[0][1] < ranges[1][1]:
        return 1
    if ranges[0][0] > ranges[1][0] or ranges[0][1] > ranges[1][1]:
        return 1
    return 0


def process_scrolling(interactionData):
    """
    Merge scrolls together (changes of visible ranges close together in time, with same direction).
    """

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

        changeRangesInteractionDirection = rangeChangeDirection(
            changeRangesInteraction)
        currentInteractionDirection = rangeChangeDirection(
            interaction)

        if (changeRangesInteractionDirection != currentInteractionDirection):
            scrollingInteractionData.append(changeRangesInteraction)
            changeRangesInteraction = copy.deepcopy(interaction)
            continue

        previousInteractionDirection = int(changeRangesInteraction["sourceRange"].split(
            "-")[0]) < int(changeRangesInteraction["targetRange"].split("-")[0])
        currentInteractionDirection = int(interaction["sourceRange"].split(
            "-")[0]) < int(interaction["targetRange"].split("-")[0])

        if previousInteractionDirection != currentInteractionDirection:
            scrollingInteractionData.append(changeRangesInteraction)
            changeRangesInteraction = copy.deepcopy(interaction)
            continue

        isScrollInteraction = changeRangesInteraction["interactionType"] == "Scroll"
        lastInteractionEndTime = changeRangesInteraction[
            "endTime"] if isScrollInteraction else changeRangesInteraction["timeStamp"]

        if interaction["timeStamp"] - lastInteractionEndTime > maxTimeBetweenChanges:
            scrollingInteractionData.append(changeRangesInteraction)
            changeRangesInteraction = interaction
        else:
            # wasn't treated as scroll yet
            if not isScrollInteraction:
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


def process_jumps(interactionData):
    navigationInteractions = ["ClickJumpButton",
                              "ClickStatusBar", "NavigationJump"]
    jumpInteractionData = []

    i = 0
    while i < len(interactionData):
        if interactionData[i]["interactionType"] in navigationInteractions:
            triggeredByUiInteraction = interactionData[i]["interactionType"] != "NavigationJump"
            jumpEntryIndex = i+2 if triggeredByUiInteraction else i+1

            combinedEntry = interactionData[jumpEntryIndex]
            combinedEntry["interactionType"] = "NavigationJump"
            combinedEntry["backwards"] = interactionData[i]["backwards"]

            if interactionData[i]["interactionType"] == "ClickJumpButton":
                combinedEntry["origin"] = "SidebarButton"
            elif interactionData[i]["interactionType"] == "ClickStatusBar":
                combinedEntry["origin"] = "StatusBar"
            else:
                combinedEntry["origin"] = "KeyboardShortcut"

            jumpInteractionData.append(combinedEntry)
            i += 3 if triggeredByUiInteraction else 2
        else:
            jumpInteractionData.append(interactionData[i])
            i += 1

    return jumpInteractionData


def refineInteractionData(interactionData):
    fixedInteractionData = remove_erroneous(interactionData)

    if (len(interactionData) > len(fixedInteractionData)):
        print(
            f"Removed {len(interactionData) - len(fixedInteractionData)} invalid interaction entries!")

    cleanedInteractionData = remove_duplicates(fixedInteractionData)

    if (len(fixedInteractionData) > len(cleanedInteractionData)):
        print(
            f"Removed {len(fixedInteractionData) - len(cleanedInteractionData)} duplicate interaction entries.")

    refinedInteractionData = process_scrolling(cleanedInteractionData)
    refinedInteractionData = combine_edits(refinedInteractionData)
    refinedInteractionData = process_jumps(refinedInteractionData)

    return refinedInteractionData


# Analysis

def splitInteractionsByTask(interactionData):
    trackingToggles = [
        interaction for interaction in interactionData if interaction["interactionType"] == "toggleTracking"]

    if len(trackingToggles) == 0:
        firstSessionInteractions = interactionData
        secondSessionInteractions = []
    elif len(trackingToggles) == 2 or len(trackingToggles) == 4:
        trackingTogglesEncountered = 0
        firstSessionInteractions = []
        secondSessionInteractions = []
        for interaction in interactionData:
            if interaction["interactionType"] == "toggleTracking":
                trackingTogglesEncountered += 1
            elif trackingTogglesEncountered == 1:
                firstSessionInteractions.append(interaction)
            elif trackingTogglesEncountered == 3:
                secondSessionInteractions.append(interaction)
    else:
        raise Exception(
            "Unexpected number of toggles encountered! Unable to analyze data.")

    return firstSessionInteractions, secondSessionInteractions


def countInteractions(interactions):
    interactionCounts = defaultdict(int)

    for interaction in interactions:
        interactionCounts[interaction["interactionType"]] += 1

    return interactionCounts


def getScrollingDistance(interactions):
    scrollingDistance = 0

    for interaction in interactions:
        if interaction["interactionType"] != "Scroll":
            continue

        rangeData = parseRanges(interaction)
        direction = rangeChangeDirection(interaction)

        upperBorderChange = abs(rangeData[0][0] - rangeData[1][0])
        lowerBorderChange = abs(rangeData[0][1] - rangeData[1][1])
        scrollingDistance += max(upperBorderChange, lowerBorderChange)

    return scrollingDistance


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
        filepath = get_newest_file(fileDir)

    interactionData = []
    with open(filepath) as interactionDataFile:
        for interaction in interactionDataFile.readlines():
            interactionData.append(json.loads(interaction))

    return interactionData

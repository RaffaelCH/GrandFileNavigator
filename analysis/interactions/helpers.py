from collections import defaultdict
import json
import glob
import os
import copy


# Cleanup

def fix_change_file_interactions(interactionData):
    fixedInteractions = []

    i = 0
    while i < len(interactionData):
        # ChangeFile interactions are split up into two interactions, containing source and target info.
        if interactionData[i]["interactionType"] == "ChangeFile" and interactionData[i + 1]["interactionType"] == "ChangeFile":
            fileTargetInteraction = interactionData[i + 1]
            newInteraction = copy.deepcopy(interactionData[i])
            newInteraction["targetFilePath"] = fileTargetInteraction["targetFilePath"]
            newInteraction["targetRange"] = fileTargetInteraction["targetRange"]

            # visible range after file change is initially 0, then jumps to actual range
            followupInteraction = interactionData[i+2]
            if followupInteraction["interactionType"] == "ChangeVisibleRanges" and followupInteraction["timeStamp"] - fileTargetInteraction["timeStamp"] < 100:
                newInteraction["targetRange"] = followupInteraction["targetRange"]
                i += 1

            fixedInteractions.append(newInteraction)
            i += 2
        else:
            fixedInteractions.append(interactionData[i])
            i += 1

    return fixedInteractions


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
    dedupedInteractionData = []

    for i in range(len(interactionData)):
        if i == len(interactionData) - 1 or interactionData[i] != interactionData[i+1]:
            dedupedInteractionData.append(interactionData[i])

    cleanedInteractionData = []
    interactionDelay = 50  # max time in ms in which entries are considered duplicates

    lastInteraction = dedupedInteractionData[0]
    for i in range(len(dedupedInteractionData)):
        timeDifference = dedupedInteractionData[i]["timeStamp"] - \
            lastInteraction["timeStamp"]

        if timeDifference > interactionDelay:
            cleanedInteractionData.append(lastInteraction)
            lastInteraction = dedupedInteractionData[i]
            continue

        currentUntimedInteraction = copy.deepcopy(dedupedInteractionData[i])
        del currentUntimedInteraction["timeStamp"]
        lastUntimedInteraction = copy.deepcopy(lastInteraction)
        del lastUntimedInteraction["timeStamp"]
        if json.dumps(lastUntimedInteraction) == json.dumps(currentUntimedInteraction):
            lastInteraction = dedupedInteractionData[i]
        else:
            cleanedInteractionData.append(lastInteraction)
            lastInteraction = dedupedInteractionData[i]

    cleanedInteractionData.append(lastInteraction)

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
        return -1
    return 0


def rangesOverlap(rangeOne, rangeTwo):
    rangeOneStart = int(rangeOne.split("-")[0])
    rangeOneEnd = int(rangeOne.split("-")[1])
    rangeTwoStart = int(rangeTwo.split("-")[0])
    rangeTwoEnd = int(rangeTwo.split("-")[1])

    # one range contained in other
    if rangeOneStart < rangeTwoStart and rangeOneEnd > rangeTwoEnd:
        return True
    if rangeTwoStart < rangeOneStart and rangeTwoEnd > rangeOneEnd:
        return True

    rangeOneBeforeRangeTwo = rangeOneStart < rangeTwoStart

    # no overlap
    if rangeOneBeforeRangeTwo and rangeOneEnd < rangeTwoStart:
        return False
    if not rangeOneBeforeRangeTwo and rangeTwoEnd < rangeOneStart:
        return False

    if rangeOneBeforeRangeTwo:
        overlap = rangeOneEnd - rangeTwoStart + 1
    else:
        overlap = rangeTwoStart - rangeOneEnd + 1

    rangeSizes = min(rangeOneEnd - rangeOneStart, rangeTwoEnd - rangeTwoStart)
    return overlap / rangeSizes > 0.75


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


def identify_histogram_jumps(interactionData):
    """Histogram jumps were mixed together with general navigation -> identify them"""
    refactoredData = []

    for interaction in interactionData:
        if interaction["interactionType"] == "ChangeVisibleRanges":
            ranges = parseRanges(interaction)
            if (abs(ranges[0][0] - ranges[1][0]) > 30 and abs(ranges[0][1] - ranges[1][1]) > 0):
                jumpInteraction = copy.deepcopy(interaction)
                # jumpInteraction["interactionType"] = "NavigationJump"
                # jumpInteraction["origin"] = "Visualization"
                # jumpInteraction["backwards"] = True  # simplifies code
                # jumpInteraction["targetFilePath"] = jumpInteraction["sourceFilePath"]
                jumpInteraction["interactionType"] = "UnknownJump"
                interaction = jumpInteraction
        refactoredData.append(interaction)

    return refactoredData


def remove_micronavigations(interactionData, min_line_change=3):
    """
        Remove isolated range changes of 1-2 lines (after processing scrolling).
        They can occur due to automated formatting or edits made.
    """

    cleanedData = []

    for interaction in interactionData:
        if interaction["interactionType"] == "ChangeVisibleRanges" or interaction["interactionType"] == "Scroll":
            ranges = parseRanges(interaction)
            if (abs(ranges[0][0] - ranges[1][0]) < min_line_change and abs(ranges[0][1] - ranges[1][1]) < min_line_change):
                continue
        cleanedData.append(interaction)

    return cleanedData


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
            additionalInteractions = 1 if interactionData[i]["interactionType"] != "NavigationJump" else 0

            if (i + additionalInteractions + 1 >= len(interactionData)):
                additionalInteractions = 0
            else:
                nextInteraction = interactionData[i +
                                                  additionalInteractions + 1]

            jumpInSameFile = nextInteraction["interactionType"] != "ChangeFile"

            if not jumpInSameFile:
                additionalInteractions += 1
                nextInteraction = interactionData[i +
                                                  additionalInteractions + 1]

            viewAdjustment = (nextInteraction["interactionType"] == "ChangeVisibleRanges" or nextInteraction["interactionType"] ==
                              "UnknownJump") and interactionData[i + additionalInteractions]["sourceRange"] == nextInteraction["sourceRange"]

            if viewAdjustment:
                additionalInteractions += 1

            jumpEntryIndex = i + additionalInteractions
            combinedEntry = interactionData[jumpEntryIndex]
            combinedEntry["interactionType"] = "NavigationJump"
            combinedEntry["backwards"] = interactionData[i]["backwards"]

            if jumpInSameFile:
                combinedEntry["targetFilePath"] = combinedEntry["sourceFilePath"]

            if interactionData[i]["interactionType"] == "ClickJumpButton":
                combinedEntry["origin"] = "SidebarButton"
            elif interactionData[i]["interactionType"] == "ClickStatusBar":
                combinedEntry["origin"] = "StatusBar"
            else:
                combinedEntry["origin"] = "KeyboardShortcut"

            if "targetRange" not in combinedEntry:
                if "sourceRange" in interactionData[jumpEntryIndex + 1]:
                    combinedEntry["targetRange"] = interactionData[jumpEntryIndex + 1]["sourceRange"]
                else:
                    combinedEntry["targetRange"] = str(
                        combinedEntry["targetLine"]) + "-" + str(combinedEntry["targetLine"])

            jumpInteractionData.append(combinedEntry)
            i = jumpEntryIndex + 1
        else:
            jumpInteractionData.append(interactionData[i])
            i += 1

    return jumpInteractionData


def refineInteractionData(interactionData):
    interactionData = [copy.deepcopy(interaction)
                       for interaction in interactionData]

    fixedInteractionData = fix_change_file_interactions(interactionData)
    fixedInteractionData = remove_erroneous(fixedInteractionData)

    if (len(interactionData) > len(fixedInteractionData)):
        print(
            f"Removed {len(interactionData) - len(fixedInteractionData)} invalid interaction entries!")

    cleanedInteractionData = remove_duplicates(fixedInteractionData)

    if (len(fixedInteractionData) > len(cleanedInteractionData)):
        print(
            f"Removed {len(fixedInteractionData) - len(cleanedInteractionData)} duplicate interaction entries.")

    jumpsInteractionData = identify_histogram_jumps(cleanedInteractionData)
    scrollingInteractionData = process_scrolling(jumpsInteractionData)
    refinedInteractionData = remove_micronavigations(scrollingInteractionData)
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
        upperBorderChange = abs(rangeData[0][0] - rangeData[1][0])
        lowerBorderChange = abs(rangeData[0][1] - rangeData[1][1])
        scrollingDistance += max(upperBorderChange, lowerBorderChange)

    return scrollingDistance


def getScrollingMetrics(interactions):
    scrollingDistance = 0
    # TODO: Get time for all navigations? Check for gaps to include in this time.
    scrollingTime = 0

    for interaction in interactions:
        if interaction["interactionType"] != "Scroll":
            continue

        rangeData = parseRanges(interaction)
        direction = rangeChangeDirection(interaction)

        upperBorderChange = abs(rangeData[0][0] - rangeData[1][0])
        lowerBorderChange = abs(rangeData[0][1] - rangeData[1][1])
        scrollingDistance += max(upperBorderChange, lowerBorderChange)

    return scrollingDistance


def approximateNavigationTime(interactions, interactionToIgnore=[]):
    navigationTime = 0
    isNavigating = False
    lastNavigationStartTime = 0
    lastNavigationEndTime = 0

    navigationInteractions = ["NavigationJump", "ChangeFile"]
    navigationInteractions = [
        i for i in navigationInteractions if i not in interactionToIgnore]

    for interaction in interactions:
        # interruptions of < 1s are ignored
        if interaction["timeStamp"] - lastNavigationEndTime > 1000 and isNavigating:
            # navigations take at least 0.5s
            navigationTime += max((lastNavigationEndTime -
                                  lastNavigationStartTime), 500)
            isNavigating = False
        if interaction["interactionType"] in navigationInteractions:
            if not isNavigating:
                isNavigating = True
                lastNavigationStartTime = interaction[
                    "startTime"] if "startTime" in interaction else interaction["timeStamp"]
            lastNavigationEndTime = interaction["endTime"] if "endTime" in interaction else interaction["timeStamp"]
    if isNavigating:
        endTime = interactions[-1]["endTime"] if "endTime" in interactions[-1] else interactions[-1]["timeStamp"]
        navigationTime += (endTime - lastNavigationStartTime)

    return navigationTime


def approximateEditingTime(interactions):
    editingTime = 0
    isEditing = False
    lastEditStartTime = 0
    lastEditEndTime = 0

    editInteractions = ["EditFile", "EditingSession"]
    for interaction in interactions:
        # interruptions of < 1s are ignored
        if interaction["timeStamp"] - lastEditEndTime > 1000:
            if isEditing:
                # edits take at least 0.5s
                editingTime += max((lastEditEndTime - lastEditStartTime), 500)
            isEditing = False
        if interaction["interactionType"] in editInteractions:
            if not isEditing:
                isEditing = True
                lastEditStartTime = interaction[
                    "startTime"] if "startTime" in interaction else interaction["timeStamp"]
            lastEditEndTime = interaction["endTime"] if "endTime" in interaction else interaction["timeStamp"]
    if isEditing:
        endTime = interactions[-1]["endTime"] if "endTime" in interactions[-1] else interactions[-1]["timeStamp"]
        editingTime += (endTime - lastEditStartTime)

    return editingTime


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

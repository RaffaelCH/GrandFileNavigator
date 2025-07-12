from enum import Enum

# Structuring


class TaskOrder(Enum):
    T1T2 = 0
    T2T1 = 1


class EvaluationTask(Enum):
    T1 = 0
    T2 = 1


class EvaluationData:
    def __init__(self, name, taskOrder, evalTask):
        self.name = name
        self.taskOrder = taskOrder
        self.evalTask = evalTask


# Participant Data
participants = [
    EvaluationData("P1", TaskOrder.T1T2, EvaluationTask.T1),
    EvaluationData("P2", TaskOrder.T1T2, EvaluationTask.T2),
    EvaluationData("P3", TaskOrder.T2T1, EvaluationTask.T2),
    EvaluationData("P4", TaskOrder.T1T2, EvaluationTask.T1),
    EvaluationData("P5", TaskOrder.T1T2, EvaluationTask.T2),
    EvaluationData("P6", TaskOrder.T2T1, EvaluationTask.T1),
    EvaluationData("P7", TaskOrder.T2T1, EvaluationTask.T1),
    EvaluationData("P8", TaskOrder.T2T1, EvaluationTask.T2),
    EvaluationData("P9", TaskOrder.T1T2, EvaluationTask.T1)
]

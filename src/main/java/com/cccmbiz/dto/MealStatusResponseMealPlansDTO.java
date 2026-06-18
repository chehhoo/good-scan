package com.cccmbiz.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class MealStatusResponseMealPlansDTO {
    private Integer mealId;
    private Integer mealOrdered;
    private int mealTaken;
    private int mealRemaining;
    private String description;
    private Integer locationId;
    private List<MealScanResponsePickUpRecordDTO> pickUpRecord;
}

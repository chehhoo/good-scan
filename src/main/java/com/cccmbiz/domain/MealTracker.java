package com.cccmbiz.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.sql.Timestamp;

@Entity
@Data
@EqualsAndHashCode
public class MealTracker {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "LastModified")  private Timestamp lastModified;
    @Column(name = "MealId")        private Integer mealId;
    @Column(name = "PersonId")      private Integer personId;
    @Column(name = "Uid")           private String uid;
    @Column(name = "RegisterId")    private Integer registerId;
    @Column(name = "HouseholdId")   private Integer householdId;
    @Column(name = "LocationId")    private Integer locationId;
    @Column(name = "Remark")        private String remark;
}
